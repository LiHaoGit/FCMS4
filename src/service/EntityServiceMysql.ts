// cSpell:words repo
import _ = require("lodash")

import { ExecuteContext } from "../Common"
import { UniqueConflictError } from "../Errors"
import { newObjectId } from "../Meta"
import { isIndexConflictError } from "../storage/MySqlStore"

function toDupKeyError(e: any, entityMeta: EntityMeta) {
    const matches = e.message.match(/Duplicate entry '(.*)' for key '(.+)'$/)
    if (matches) {
        // value = matches[1]
        const key = matches[2]
        const specifiedKey = entityMeta.tableName + "_" + key
        const indexCfg = _.find(entityMeta.mysqlIndexes,
            i => i.name === specifiedKey)
        const message = indexCfg && indexCfg.errorMessage || `值重复：${key}`
        return {code: "DupKey", message, key}
    } else {
        return {code: "DupKey", message: e.message, key: null}
    }
}

export async function aCreate(ctx: ExecuteContext, entityMeta: EntityMeta,
    instance: EntityValue) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    if (!_.size(instance)) return null

    const id = newObjectId().toString()
    instance._id = id

    try {
        await conn.aInsertOne(entityMeta.tableName || entityMeta.name, instance)
        return id
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = toDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

export async function aUpdateManyByCriteria(ctx: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria, instance: EntityValue) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    if (!_.size(instance)) return null
    try {
        const tableName = entityMeta.tableName || entityMeta.name
        const r = await conn.aUpdateByObject(tableName, criteria, instance)
        return r ? r.changedRows : -1
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = toDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

export async function aUpdateOneByCriteria(ctx: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria, instance: EntityValue,
    options?: UpdateOption) {

    // TODO options.upsert

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    if (!_.size(instance)) return null
    try {
        const tableName = entityMeta.tableName || entityMeta.name
        const r = await conn.aUpdateByObject(tableName, criteria, instance)
        return r ? r.changedRows : -1
    } catch (e) {
        if (!isIndexConflictError(e)) throw e
        const {code, message} = toDupKeyError(e, entityMeta)
        throw new UniqueConflictError(code, message, "")
    }
}

export async function aRemoveManyByCriteria(ctx: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    const tableName = entityMeta.tableName || entityMeta.name
    await conn.aDeleteManyByCriteria(tableName, criteria)
}

export async function aFindOneByCriteria(ctx: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria, o?: FindOption) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    const table = entityMeta.tableName || entityMeta.name
    const includedFields = getFinalIncludedFields(entityMeta,
        o && o.includedFields || [])

    return conn.aFindOneByCriteria(table, criteria, includedFields)
}

// sort 为 mongo 原生格式
export async function aList(ctx: ExecuteContext, entityMeta: EntityMeta,
    options: ListOption) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    const table = entityMeta.tableName || entityMeta.name

    const { criteria, sort, withoutTotal, pageNo, pageSize } = options
    const includedFields = getFinalIncludedFields(entityMeta,
        options.includedFields || [])

    const query = {criteria: criteria || {}, includedFields, sort,
        pageNo, pageSize, paging: !withoutTotal}

    return conn.aFind(table, query)
}

// 从某个历史纪录中恢复
export async function aRestoreHistory(ctx: ExecuteContext,
    entityMeta: EntityMeta, id: any, version: number, operatorId: string) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    const table = entityMeta.tableName || entityMeta.name
    const historyTable = table + "_history"
    const entity = await conn.aFindOneByCriteria(historyTable, {_oldId: id})

    delete entity._id
    delete entity._oldId
    delete entity._version
    entity._modifiedBy = operatorId
    entity._modifiedOn = new Date()

    return aUpdateOneByCriteria(ctx, entityMeta, {_id: id}, entity)
}

export async function aGetHistoryItem(ctx: ExecuteContext,
    entityMeta: EntityMeta, id: any) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    const table = entityMeta.tableName || entityMeta.name
    const historyTable = table + "_history"

    // 历史表的 ID 一律是 ObjectId
    return conn.aFindOneByCriteria(historyTable, {_id: id})
}

// 列出历史纪录
export async function aListHistory(ctx: ExecuteContext,
    entityMeta: EntityMeta, id: any) {

    const conn = ctx.conn
    if (!conn) throw new Error("No connection")

    const table = entityMeta.tableName || entityMeta.name
    const historyTable = table + "_history"
    const criteria = {_oldId: id}
    const includedFields = ["_modifiedOn", "_modifiedBy", "_version"]

    // 不分页
    const query = {criteria, includedFields, pageSize: -1, paging: false}
    return conn.aFind(historyTable, query)
}

function getFinalIncludedFields(entityMeta: EntityMeta,
    includedFields?: string[]): string[] {

    if (!(includedFields && includedFields.length)) return []
    const included: string[] = []
    const excluded: string[] = []
    for (const field of includedFields) {
        if (field[0] === "-") {
            excluded.push(field.substring(1))
        } else if (field[0] === "+") {
            included.push(field.substring(1))
        } else {
            included.push(field)
        }
    }
    if (excluded.length) {
        const allFields = Object.keys(entityMeta.fields)
        return _.difference(allFields, excluded)
    } else {
        return included
    }
}
