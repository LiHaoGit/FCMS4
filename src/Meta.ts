// cSpell:words upsert repo

import * as crypto from "crypto"
import * as _ from "lodash"
import * as mongodb from "mongodb"
import { getLogger } from "./Log"
import { getMainStore, stringToObjectIdSilently } from "./storage/MongoStore"
import { aPublish, subscribe } from "./storage/RedisStore"
import { initSystemMeta, SystemEntities } from "./SystemMeta"
import { dateToLong, longToDate, stringToBoolean, stringToFloat,
    stringToInt } from "./Util"

const ObjectId = mongodb.ObjectId

export const DB = {mongo: "mongodb", mysql: "mysql", none: "none"}

export const ObjectIdStringLength = 24

// 字段逻辑类型（应用层类型）
export const FieldDataTypes = ["ObjectId", "String", "Password", "Boolean",
    "Int", "Float",
    "Date", "Time", "DateTime",
    "Image", "File",
    "Component", "Reference", "Object"]

// MongoDB存储类型
const MongoPersistTypes = ["ObjectId", "String", "Boolean", "Number",
    "Date", "Document"]

const MySQLPersistTypes = ["varchar", "char", "blob", "text",
    "int", "bit", "tinyint", "bigint", "decimal", "float", "double",
    "datetime", "date", "time", "timestamp"]

export const AllPersistTypes = MongoPersistTypes.concat(MySQLPersistTypes)

export const InputTypes = ["Text", "Password", "TextArea", "RichText", "JSON",
    "Select", "Check", "Int", "Float", "CheckList",
    "Date", "Time", "DateTime", "File", "Image",
    "InlineComponent", "PopupComponent", "TabledComponent", "Reference"]

export const actions = {}

function isDateOrTimeType(fieldType: string) {
    return fieldType === "Date" || fieldType === "Time" ||
        fieldType === "DateTime"
}

let entities: {[k: string]: EntityMeta}

const MetaStoreId = new ObjectId().toString()

export function getEntityMeta(name: string) {
    const e = entities[name]
    if (!e) throw new Error("No such entity meta: " + name)
    return e
}

export function getEntities() {
    return entities
}

export function getMetaForFront() {
    return {entities}
}

export async function aLoad(extraEntities: {[k: string]: EntityMeta}) {
    const systemLogger = getLogger("system")

    subscribe("MetaChange", async function(metaStoreId) {
        if (metaStoreId !== MetaStoreId) return
        systemLogger.info("MetaChanged")
        await aLoad({})
    })

    initSystemMeta(extraEntities)

    const db = await getMainStore().aDatabase()

    const c = db.collection("F_EntityMeta")
    const entitiesList = await c.find({}).toArray()

    // 下面没有异步操作
    entities = {}
    for (const e of entitiesList) entities[e.name] = e

    Object.assign(entities, SystemEntities)

    systemLogger.info("Meta loaded")
}

export async function aSaveEntityMeta(entityName: string,
    entityMeta: EntityMeta) {
    entityMeta._modifiedOn = new Date()
    delete entityMeta._version

    const db = await getMainStore().aDatabase()
    const c = db.collection("F_EntityMeta")

    await c.updateOne({name: entityName},
        {$set: entityMeta, $inc: {_version: 1}}, {upsert: true})

    entities[entityName] = entityMeta

    await aPublish("MetaChange", MetaStoreId)
}

export async function aRemoveEntityMeta(entityName: string) {
    const db = await getMainStore().aDatabase()
    const c = db.collection("F_EntityMeta")
    await c.remove({name: entityName})

    delete entities[entityName]

    await aPublish("MetaChange", MetaStoreId)
}

// 将 HTTP 输入的实体或组件值规范化
// 过滤掉元数据中没有的字段
export function parseEntity(entityInput: EntityValue, entityMeta: EntityMeta) {
    if (!entityInput) return entityInput
    if (!_.isObject(entityInput)) return undefined
    const entityValue: EntityValue = {}
    const fields = entityMeta.fields
    Object.keys(fields).forEach(fName => {
        const fMeta = fields[fName]
        const fv = parseFieldValue(entityInput[fName], fMeta)
        // undefined / NaN 去掉，null 保留！
        if (!(_.isUndefined(fv) || _.isNaN(fv))) entityValue[fName] = fv
    })

    return entityValue
}

// 将 HTTP 输入的查询条件中的值规范化
export function parseListQueryValue(criteria: GenericCriteria,
    entityMeta: EntityMeta) {
    // 如果输入的值有问题，可能传递到下面的持久层，如 NaN, undefined, null
    if (criteria.relation)
        for (const item of criteria.items)
            parseListQueryValue(item, entityMeta)
    else if (criteria.field) {
        const fieldMeta = entityMeta.fields[criteria.field]
        criteria.value = parseFieldValue(criteria.value, fieldMeta)
    }
}

// 将 HTTP 输入的字段值规范化，value 可以是数组
export function parseFieldValue(value: any, fieldMeta?: FieldMeta): any {
    if (!fieldMeta) return undefined // TODO 异常处理
    // null / undefined 语义不同
    if (_.isNil(value)) return value // null/undefined 原样返回

    // for 循环放在 if 内为提高效率
    if (isDateOrTimeType(fieldMeta.type)) {
        if (_.isArray(value))
            return _.map(value, longToDate)
        else
            return longToDate(value)
    } else if (fieldMeta.type === "ObjectId") {
        if (_.isArray(value))
            return _.map(value,
                stringToObjectIdSilently) // null 值不去
        else
            return stringToObjectIdSilently(value)
    } else if (fieldMeta.type === "Reference") {
        if (!fieldMeta.refEntity)
            throw new Error(`No ref entity for field ${fieldMeta.name}`)
        const refEntityMeta = getEntityMeta(fieldMeta.refEntity)
        if (!refEntityMeta)
            throw new Error(`No ref entity [${fieldMeta.refEntity}]. ` +
                `Field ${fieldMeta.name}.`)

        const idMeta = refEntityMeta.fields._id
        return parseFieldValue(value, idMeta)
    } else if (fieldMeta.type === "Boolean")
        if (_.isArray(value))
            return _.map(value, stringToBoolean)
        else
            return stringToBoolean(value)
    else if (fieldMeta.type === "Int")
        if (_.isArray(value))
            return _.map(value, stringToInt)
        else
            return stringToInt(value)
    else if (fieldMeta.type === "Float")
        if (_.isArray(value))
            return _.map(value, stringToFloat)
        else
            return stringToFloat(value)
    else if (fieldMeta.type === "Component") {
        if (!fieldMeta.refEntity)
            throw new Error(`No ref entity for field ${fieldMeta.name}`)
        const refEntityMeta = getEntityMeta(fieldMeta.refEntity)
        if (!refEntityMeta)
            throw new Error(`No ref entity [${fieldMeta.refEntity}].` +
                `Field ${fieldMeta.name}.`)

        if (_.isArray(value))
            return _.map(value, i => parseEntity(i, refEntityMeta))
        else
            return parseEntity(value, refEntityMeta)
    } else if (fieldMeta.type === "Password") {
        if (!value) return undefined // 不接受空字符串

        if (_.isArray(value))
            return _.map(value, hashPassword)
        else
            return hashPassword(value)
    } else
        return value ? value : null // 空字符串转为 null
}

export function parseId(id: string, entityMeta: string | EntityMeta) {
    if (_.isString(entityMeta))
        entityMeta = getEntityMeta(entityMeta)
    return parseFieldValue(id, entityMeta.fields._id)
}

export function parseIds(ids: string[], entityMeta: string | EntityMeta) {
    if (!ids) return ids

    if (_.isString(entityMeta))
        entityMeta = getEntityMeta(entityMeta)

    const idMeta = entityMeta.fields._id
    const list = []
    for (const id of ids) {
        const i = parseFieldValue(id, idMeta)
        if (i) list.push(i)
    }
    return list
}

export function formatFieldToHttp(fieldValue: any, fieldMeta: FieldMeta) {
    if (!fieldValue) return fieldValue

    if (isDateOrTimeType(fieldMeta.type))
        if (fieldMeta.multiple)
            return _.map(fieldValue, dateToLong)
        else
            return dateToLong(fieldValue)
    else if (fieldMeta.type === "Component") {
        if (!fieldMeta.refEntity)
            throw new Error(`No ref entity for field ${fieldMeta.name}`)
        const refEntityMeta = getEntityMeta(fieldMeta.refEntity)
        if (!refEntityMeta)
            throw new Error(`No ref entity [${fieldMeta.refEntity}]. ` +
                `Field ${fieldMeta.name}`)

        if (fieldMeta.multiple)
            return _.map(fieldValue, i =>
                formatEntityToHttp(i, refEntityMeta))
        else
            return formatEntityToHttp(fieldValue, refEntityMeta)
    } else if (fieldMeta.type === "Reference")
        return fieldValue // TODO 原样输出即可
    else if (fieldMeta.type === "Password")
        return undefined
    else
        return fieldValue
}

export function formatEntityToHttp(entityValue: EntityValue | null | undefined,
    entityMeta: EntityMeta) {
    if (!entityValue) return entityValue

    const output: EntityValue = {}

    for (const fName in entityMeta.fields) {
        const fieldMeta = entityMeta.fields[fName]
        const o = formatFieldToHttp(entityValue[fName], fieldMeta)
        if (!_.isUndefined(o)) output[fName] = o
    }

    return output
}

export function formatEntitiesToHttp(entityValues: EntityMeta[],
    entityMeta: EntityMeta) {
    if (!(entityValues && entityValues.length)) return entityValues
    return _.map(entityValues, e => formatEntityToHttp(e, entityMeta))
}

export function hashPassword(password?: string | null) {
    if (!password) return password
    return crypto.createHash("md5").update(password + password).digest("hex")
}

export function checkPasswordEquals(target: string, notSalted: string) {
    return hashPassword(notSalted) === target
}

export function getCollectionName(entityMeta: EntityMeta,
    repo?: string | null) {
    if (repo === "trash")
        return entityMeta.tableName + "_trash"
    else
        return entityMeta.tableName
}

export function newObjectId() {
    return new ObjectId()
}

export function imagePathsToImageObjects(paths: string[],
    thumbnailFilled: boolean) {
    if (!(paths && paths.length)) return paths

    return _.map(paths, path => {
        const o = {path, thumbnail: ""}
        if (thumbnailFilled) o.thumbnail = path
        return o
    })
}
