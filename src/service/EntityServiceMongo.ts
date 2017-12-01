// cSpell:words repo

import * as _ from "lodash"
import * as mongodb from "mongodb"

import { UniqueConflictError } from "../Errors"
import { logSystemWarn } from "../Log"
import { getCollectionName, newObjectId } from "../Meta"
import { getInsertedIdObject, getStore, getUpdateResult,
    isIndexConflictError, toMongoCriteria } from "../storage/MongoStore"
import { arrayToTrueObject } from "../Util"

export async function aCreate(entityMeta: EntityMeta, instance: EntityValue)
    : Promise<any> {
    // ObjectId 或非 String 的 id 由调用者设置，这里自动设置 String 类型的 ID
    if (entityMeta.fields._id.persistType === "String" && _.isNil(instance._id))
        instance._id = newObjectId().toString()

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(entityMeta.tableName || entityMeta.name)

    try {
        const res = await c.insertOne(instance)
        return getInsertedIdObject(res)
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = errorToDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

export async function aUpdateManyByCriteria(entityMeta: EntityMeta,
    criteria: GenericCriteria, instance: EntityValue) {
    const update = objectToMongoUpdate(instance)
    if (!update) return 0

    const nativeCriteria = toMongoCriteria(criteria)

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(entityMeta.tableName || entityMeta.name)

    try {
        const res = await c.updateMany(nativeCriteria, update)
        const r = getUpdateResult(res)
        return r.modifiedCount
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = errorToDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

export async function aUpdateOneByCriteria(entityMeta: EntityMeta,
    criteria: GenericCriteria, instance: EntityValue,
    options?: UpdateOption) {
    const update = objectToMongoUpdate(instance)
    if (!update) return 0

    const nativeCriteria = toMongoCriteria(criteria)

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(entityMeta.tableName || entityMeta.name)

    try {
        const res = await c.updateOne(nativeCriteria, update, options)
        return getUpdateResult(res)
        // if (r.modifiedCount !== 1)
        //     throw new Errors.UserError("ConcurrentUpdate")
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = errorToDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

export async function aRemoveManyByCriteria(entityMeta: EntityMeta,
    criteria: GenericCriteria) {
    const nativeCriteria = toMongoCriteria(criteria)

    if (entityMeta.removeMode === "toTrash")
        return aRemoveManyToTrash(entityMeta, nativeCriteria)
    else
        return aRemoveManyCompletely(entityMeta, nativeCriteria)
}

// 软删除有几种方式：放在单独的表中，放在原来的表中+使用标记字段。
// 放在单独的表中，在撤销删除后，有id重复的风险：例如删除id为1的实体，其后又产生了id为1的实体，则把删除的实体找回后就主键冲突了
// 好在目前采用ObjectId的方式不会导致该问题。
// 放在原表加标记字段的方式，使得所有的查询都要记得查询删除标记为false的实体，并影响索引的构建，麻烦

async function aRemoveManyToTrash(entityMeta: EntityMeta,
    criteria: MongoCriteria) {
    const trashTable = getCollectionName(entityMeta, "trash")

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const formalCollection = db.collection(entityMeta.tableName ||
        entityMeta.name)
    const trashCollection = db.collection(trashTable)

    const list = await formalCollection.find(criteria).toArray()

    for (const entity of list) {
        entity._modifiedOn = new Date()
        entity._version++
    }

    await trashCollection.insertMany(list)
    await formalCollection.deleteMany(criteria)
}

async function aRemoveManyCompletely(entityMeta: EntityMeta,
    criteria: MongoCriteria) {
    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(entityMeta.tableName || entityMeta.name)
    await c.deleteMany(criteria)
}

export async function aRecoverMany(entityMeta: EntityMeta,
    ids: any[]) {
    const trashTable = getCollectionName(entityMeta, "trash")

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const formalCollection = db.collection(entityMeta.tableName ||
        entityMeta.name)
    const trashCollection = db.collection(trashTable)

    const list = await trashCollection.find({_id: {$in: ids}}).toArray()

    for (const entity of list) {
        entity._modifiedOn = new Date()
        entity._version++
    }

    try {
        await formalCollection.insertMany(list)
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = errorToDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }

    await trashCollection.deleteMany({_id: {$in: ids}})
}

export async function aFindOneByCriteria(entityMeta: EntityMeta,
    criteria: GenericCriteria, o?: FindOption) {
    const collectionName = getCollectionName(entityMeta, o && o.repo)

    const nativeCriteria = toMongoCriteria(criteria)

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(collectionName)
    const projection = arrayToTrueObject(o && o.includedFields) || {}
    return c.findOne(nativeCriteria, projection)
}

// sort 为 mongo 原生格式
export async function aList(entityMeta: EntityMeta, options: ListOption) {
    const {
        criteria, sort, repo, includedFields, withoutTotal
    } = options
    const collectionName = getCollectionName(entityMeta, repo)
    const nativeCriteria = toMongoCriteria(criteria)
    const projection = arrayToTrueObject(includedFields) || {}

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(collectionName)

    const cursor = c.find(nativeCriteria, projection).sort(sort || {})
    // 判定是否分页
    const pageNo = options.pageNo || 1
    const pageSize = options.pageSize || 10
    if (pageSize > 0) cursor.skip((pageNo - 1) * pageSize).limit(pageSize)

    const page = await cursor.toArray()
    if (withoutTotal) {
        return page
    } else {
        const total = await c.count(nativeCriteria)
        return {total, page}
    }
}

function errorToDupKeyError(e: Error, entityMeta: EntityMeta) {
    // Log.debug("toDupKeyError, message", e.message)
    const matches = e.message.match(/index:\s(.+) dup key: (.+)/)
    if (matches) {
        let indexName = matches[1]
        const dollarIndex = indexName.indexOf("$")
        if (dollarIndex >= 0) {
            indexName = indexName.substring(dollarIndex + 1)
        }
        // Log.debug("toDupKeyError, indexName=" + indexName)

        const indexConfig = _.find(entityMeta.mongoIndexes, i =>
            entityMeta.tableName + "_" + i.name === indexName)
        if (!indexConfig) logSystemWarn("No index config for " + indexName)
        const message = indexConfig && indexConfig.errorMessage ||
            `值重复：${indexName}`
        return {code: "DupKey", message, key: indexName}
    } else {
        return {code: "DupKey", message: e.message, key: null}
    }
}

// 用户提交的更新后的对象，转换为 mongo 的 $set
function objectToMongoUpdate(object: any) {
    if (!_.size(object)) return null

    delete object._version
    delete object._id

    const set: {[k: string]: any} = {}
    const unset: {[k: string]: any} = {}

    for (const key in object) {
        const value = object[key]

        if (!_.isNil(value))
            set[key] = value
        else
            unset[key] = ""
    }

    const update: any = {$inc: {_version: 1}}
    if (_.size(set)) update.$set = set
    if (_.size(unset)) update.$unset = unset

    return update
}
