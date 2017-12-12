// cSpell:words repo

import * as _ from "lodash"
import * as mongodb from "mongodb"

import { UniqueConflictError } from "../Errors"
import { logSystemWarn } from "../Log"
import { newObjectId } from "../Meta"
import { getInsertedIdObject, getStore, getUpdateResult,
    isIndexConflictError, toMongoCriteria } from "../storage/MongoStore"
import { arrayToTrueObject } from "../Util"

interface MongoUpdate {
    $set?: any
    $unset?: any
    $inc?: any
}

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
    if (!update) return null

    const nativeCriteria = toMongoCriteria(criteria)

    const tableName = entityMeta.tableName || entityMeta.name
    const db = await getStore(entityMeta.dbName || "main").aDatabase()

    try {
        if (entityMeta.history) {
            return aUpdateManyByCriteriaWithHistory(db, tableName,
                nativeCriteria, update)
        } else {
            const c = db.collection(tableName)
            const res = await c.updateMany(nativeCriteria, update)
            return getUpdateResult(res).modifiedCount
        }
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = errorToDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

async function aUpdateManyByCriteriaWithHistory(db: mongodb.Db,
    tableName: string, nativeCriteria: any, update: any) {

    const mainC = db.collection(tableName)
    const entities = await mainC.find(nativeCriteria).toArray()

    entities.forEach(entity => {
        entity._oldId = entity._id
        delete entity._id
    })

    const historyC = db.collection(tableName + "_history")
    await historyC.insertMany(entities)

    const ids = entities.map(e => e._oldId)

    const res = await mainC.updateMany({_id: {$in: ids}}, update)
    return getUpdateResult(res).modifiedCount
}

export async function aUpdateOneByCriteria(entityMeta: EntityMeta,
    criteria: GenericCriteria, instance: EntityValue,
    options?: UpdateOption) {
    const update = objectToMongoUpdate(instance)
    if (!update) return null

    const nativeCriteria = toMongoCriteria(criteria)

    const tableName = entityMeta.tableName || entityMeta.name
    const db = await getStore(entityMeta.dbName || "main").aDatabase()

    try {
        if (entityMeta.history) { // > 0 || < 0
            return aUpdateOneByCriteriaWithHistory(db, tableName,
                nativeCriteria, update, options)
        } else {
            const c = db.collection(tableName)
            const res = await c.updateOne(nativeCriteria, update, options)
            return getUpdateResult(res)
        }
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = errorToDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

async function aUpdateOneByCriteriaWithHistory(db: mongodb.Db,
    tableName: string, nativeCriteria: any, update: any,
    options?: UpdateOption) {

    const mainC = db.collection(tableName)
    const entity = await mainC.findOne(nativeCriteria)

    entity._oldId = entity._id
    delete entity._id

    const historyC = db.collection(tableName + "_history")
    await historyC.insertOne(entity)

    const res = await mainC.updateOne({_id: entity._oldId}, update, options)
    return getUpdateResult(res)
}

export async function aRemoveManyByCriteria(entityMeta: EntityMeta,
    criteria: GenericCriteria) {
    const nativeCriteria = toMongoCriteria(criteria)

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(entityMeta.tableName || entityMeta.name)
    await c.deleteMany(nativeCriteria)
}

export async function aFindOneByCriteria(entityMeta: EntityMeta,
    criteria: GenericCriteria, o?: FindOption) {
    const collectionName = entityMeta.tableName || entityMeta.name

    const nativeCriteria = toMongoCriteria(criteria)

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(collectionName)
    const projection = arrayToTrueObject(o && o.includedFields) || {}
    return c.findOne(nativeCriteria, projection)
}

// sort 为 mongo 原生格式
export async function aList(entityMeta: EntityMeta, options: ListOption)
    : Promise<PagingListResult | EntityPage> {

    const { criteria, sort, includedFields, withoutTotal } = options
    const collectionName = entityMeta.tableName || entityMeta.name
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
        return {total, page, pageNo, pageSize}
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
function objectToMongoUpdate(object: any): MongoUpdate | null {
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

    const update: MongoUpdate = {$inc: {_version: 1}}
    if (_.size(set)) update.$set = set
    if (_.size(unset)) update.$unset = unset

    return update
}

// 列出历史纪录
export async function aListHistory(entityMeta: EntityMeta, id: any,
    pageNo: number, pageSize: number) {

    const collectionName = entityMeta.tableName || entityMeta.name
    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const c = db.collection(collectionName + "_history")
    const criteria = {_OldId: id}
    const cursor = c.find(criteria) // TODO projection
    pageNo = pageNo || 1
    pageSize = pageSize || 10
    cursor.skip((pageNo - 1) * pageSize).limit(pageSize)

    const page = await cursor.toArray()
    const total = await c.count(criteria)

    return {page, total, pageNo, pageSize}
}

// 从某个历史纪录中恢复
export async function aRestoreHistory(entityMeta: EntityMeta, id: any,
    version: number, operatorId: string) {

    const collectionName = entityMeta.tableName || entityMeta.name
    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    const historyC = db.collection(collectionName + "_history")
    const entity = await historyC.findOne({_oldId: id})

    delete entity._id
    delete entity._oldId
    delete entity._version
    entity._modifiedBy = operatorId
    entity._modifiedOn = new Date()

    return aUpdateOneByCriteria(entityMeta, {_id: id}, entity)
}
