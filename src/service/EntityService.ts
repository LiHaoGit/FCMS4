// cSpell:words repo Serv

import * as _ from "lodash"
import * as mongodb from "mongodb"

import { UserError } from "../Errors"
import { DB, getEntityMeta, parseId } from "../Meta"
import { traceAccessService, traceQueryDB } from "../tuning/ServiceStats"
import { objectToKeyValuePairString } from "../Util"
import { aFireEntityCreated, aFireEntityRemoved,
    aFireEntityUpdated, aWithCache } from "./EntityServiceCache"
import * as MongoServ from "./EntityServiceMongo"
import * as MysqlServ from "./EntityServiceMysql"

export async function aCreate(conn: ExecuteContext, entityName: string,
    instance: EntityValue): Promise<CreateResult> {

    if (!_.size(instance)) throw new UserError("CreateEmpty")

    const entityMeta = getEntityMeta(entityName)

    instance._version = 1
    instance._createdOn = new Date()
    instance._modifiedOn = instance._createdOn

    try {
        const id = entityMeta.db === DB.mysql
            ? await MysqlServ.aCreate(conn, entityMeta, instance)
            : await MongoServ.aCreate(entityMeta, instance)
        instance._id = id
        return {id}
    } finally {
        // 很可能实体还是被某种程度修改，导致缓存失效
        await aFireEntityCreated(conn, entityMeta)
    }
}

export async function aUpdateOneByCriteria(conn: ExecuteContext,
    entityName: string, criteria: GenericCriteria, instance: EntityValue,
    option?: UpdateOption) {
    delete instance._id
    delete instance._version
    delete instance._createdBy
    delete instance._createdOn

    if (!_.size(instance)) return

    instance._modifiedOn = new Date()

    const entityMeta = getEntityMeta(entityName)

    try {
        return (entityMeta.db === DB.mysql)
            ? MysqlServ.aUpdateOneByCriteria(conn, entityMeta,
                criteria, instance, option)
            : MongoServ.aUpdateOneByCriteria(entityMeta,
                criteria, instance, option)
    } finally {
        // TODO 清除效率改进
        await aFireEntityUpdated(conn, entityMeta)
    }
}

export async function aUpdateManyByCriteria(conn: ExecuteContext,
    entityName: string, criteria: GenericCriteria, instance: EntityValue) {
    delete instance._id
    delete instance._version
    delete instance._createdBy
    delete instance._createdOn

    if (!_.size(instance)) return

    instance._modifiedOn = new Date()

    const entityMeta = getEntityMeta(entityName)

    try {
        return entityMeta.db === DB.mysql
            ? MysqlServ.aUpdateManyByCriteria(conn, entityMeta, criteria,
                instance)
            : MongoServ.aUpdateManyByCriteria(entityMeta, criteria, instance)
    } finally {
        // TODO 清除效率改进
        await aFireEntityUpdated(conn, entityMeta)
    }
}

export async function aRemoveManyByCriteria(conn: ExecuteContext,
    entityName: string, criteria: GenericCriteria) {
    const entityMeta = getEntityMeta(entityName)

    try {
        return (entityMeta.db === DB.mysql)
            ? MysqlServ.aRemoveManyByCriteria(conn, entityMeta, criteria)
            : MongoServ.aRemoveManyByCriteria(entityMeta, criteria)
    } finally {
        // TODO 清除效率改进
        await aFireEntityRemoved(conn, entityMeta)
    }
}

export async function aFindOneById(conn: ExecuteContext, entityName: string,
    id: any, oOrInclude?: FindOption | string[]): Promise<EntityValue | null> {

    const entityMeta = getEntityMeta(entityName)

    id = parseId(id, entityMeta) // 确保 id 类型正确

    const o = ((_.isArray(oOrInclude)) ? {includedFields: oOrInclude}
        : (oOrInclude || {})) as FindOption

    const includedFields = o.includedFields || []
    const criteria = {_id: id}

    const cacheId = `${id}|${includedFields.join(",")}`

    traceAccessService(entityName, "OneId", id)

    return aWithCache(entityMeta, ["Id", cacheId], async() => {
        traceQueryDB(entityName, "OneId", id)

        return entityMeta.db === DB.mysql
            ? MysqlServ.aFindOneByCriteria(conn, entityMeta, criteria, o)
            : MongoServ.aFindOneByCriteria(entityMeta, criteria, o)})
}

export async function aFindOneByCriteria(conn: ExecuteContext,
    entityName: string, criteria: GenericCriteria,
    oOrInclude?: FindOption | string[]): Promise<EntityValue | null> {

    const entityMeta = getEntityMeta(entityName)

    const o = ((_.isArray(oOrInclude)) ? {includedFields: oOrInclude}
        : (oOrInclude || {})) as FindOption
    const includedFields = o.includedFields || []
    const criteriaString = JSON.stringify(criteria)

    const cacheId = "OneByCriteria|" + criteriaString
        + "|" + includedFields.join(",")

    traceAccessService(entityName, "OneCriteria", criteriaString)

    return aWithCache(entityMeta, ["Other", cacheId], async() => {
        traceQueryDB(entityName, "OneCriteria", criteriaString)

        return entityMeta.db === DB.mysql
            ? MysqlServ.aFindOneByCriteria(conn, entityMeta, criteria, o)
            : MongoServ.aFindOneByCriteria(entityMeta, criteria, o)})
}

export async function aList(conn: ExecuteContext, entityName: string,
    options: ListOption): Promise<PagingListResult | EntityPage> {

    let { criteria, pageNo, sort } = options
    const { pageSize, includedFields, withoutTotal} = options
    const entityMeta = getEntityMeta(entityName)

    if (!pageNo || pageNo < 1) pageNo = 1
    sort = sort || {}
    criteria = criteria || {}

    const criteriaString = JSON.stringify(criteria)
    const sortString = objectToKeyValuePairString(sort)
    const includedFieldsString = includedFields && includedFields.join(",")

    const cacheId = `List|${pageNo}|${pageSize}|${criteriaString}|`
        + `${sortString}|${includedFieldsString}`

    const query = {
        entityMeta, criteria, includedFields,
        sort, pageNo, pageSize, withoutTotal
    }

    traceAccessService(entityName, "ManyCriteria", criteriaString)

    return aWithCache(entityMeta, ["Other", cacheId], async() => {
        traceQueryDB(entityName, "ManyCriteria", criteriaString)

        return entityMeta.db === DB.mysql
            ? MysqlServ.aList(conn, query)
            : MongoServ.aList(entityMeta, query)})
}

export async function aFindManyByCriteria(conn: ExecuteContext,
    entityName: string, oOrInclude?: ListOption | string[])
    : Promise<EntityPage> {

    const o = ((_.isArray(oOrInclude)) ? {includedFields: oOrInclude}
        : (oOrInclude || {})) as ListOption
    o.pageSize = o.pageSize || -1
    o.withoutTotal = true

    return aList(conn, entityName, o) as Promise<EntityPage>
}

export async function aFindManyByIds(conn: ExecuteContext, entityName: string,
    ids: any[], oOrInclude: ListOption | string[]): Promise<EntityPage> {

    const o = (_.isArray(oOrInclude) ? {includedFields: oOrInclude}
        : (oOrInclude || {})) as ListOption

    const entityMeta = getEntityMeta(entityName)
    ids = ids.map(id => id && parseId(id, entityMeta)) // 确保 id 类型正确

    o.criteria = {
        __type: "relation", field: "_id", operator: "in", value: ids
    }
    o.pageSize = -1
    o.withoutTotal = true

    return aList(conn, entityName, o) as Promise<EntityPage>
}

export async function aWithTransaction<T>(entityMeta: EntityMeta,
    aWork: (conn: any) => T): Promise<T> {
    // if (entityMeta.db === DB.mysql)
    //     return Mysql.mysql.aWithTransaction(async conn => aWork(conn))
    // else
    return aWork({})
}

export async function aWithoutTransaction<T>(entityMeta: EntityMeta,
    aWork: (conn: any) => T): Promise<T> {
    // if (entityMeta.db === DB.mysql)
    //     return Mysql.mysql.aWithoutTransaction(async conn => aWork(conn))
    // else
    return aWork({})
}

// 列出历史纪录
export async function aListHistory(conn: ExecuteContext, entityMeta: EntityMeta,
    id: any) {

    // TODO history cache?
    return entityMeta.db === DB.mysql
        ? MysqlServ.aListHistory(conn, entityMeta, id)
        : MongoServ.aListHistory(entityMeta, id)
}

// 查看一项历史详情
export async function aGetHistoryItem(conn: ExecuteContext,
    entityMeta: EntityMeta, id: any) {

    // TODO history cache?
    return entityMeta.db === DB.mysql
        ? MysqlServ.aGetHistoryItem(conn, entityMeta, id)
        : MongoServ.aGetHistoryItem(entityMeta, id)
}

// 从某个历史纪录中恢复
export async function aRestoreHistory(conn: ExecuteContext,
    entityMeta: EntityMeta, id: any, version: number, operatorId: string) {

    try {
        return entityMeta.db === DB.mysql
            ? MysqlServ.aRestoreHistory(conn, entityMeta, id, version,
                operatorId)
            : MongoServ.aRestoreHistory(entityMeta, id, version, operatorId)
    } finally {
        // TODO 清除效率改进
        await aFireEntityUpdated(conn, entityMeta)
    }
}
