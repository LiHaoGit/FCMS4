
import * as _ from "lodash"
import * as mongodb from "mongodb"

import { UserError } from "../Errors"
import { } from "../Log"
import { DB, getEntityMeta } from "../Meta"
import { objectToKeyValuePairString } from "../Util"
import { aFireEntityCreated, aFireEntityRemoved,
    aFireEntityUpdated, aWithCache } from "./EntityServiceCache"
import * as MongoService from "./EntityServiceMongo"
import * as MysqlService from "./EntityServiceMysql"

export async function aCreate(conn: ExecuteContext, entityName: string,
    instance: EntityValue) {
    if (!_.size(instance)) throw new UserError("CreateEmpty", "CreateEmpty")
    const entityMeta = getEntityMeta(entityName)

    instance._version = 1
    instance._createdOn = new Date()
    instance._modifiedOn = instance._createdOn

    try {
        const id = entityMeta.db === DB.mysql
            ? await MysqlService.aCreate(conn, entityMeta, instance)
            : await MongoService.aCreate(entityMeta, instance)
        instance._id = id
        return {_id: id}
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
            ? MysqlService.aUpdateOneByCriteria(conn, entityMeta,
                criteria, instance, option)
            : MongoService.aUpdateOneByCriteria(entityMeta,
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
        return (entityMeta.db === DB.mysql)
            ? MysqlService.aUpdateManyByCriteria(conn,
                entityMeta, criteria, instance)
            : MongoService.aUpdateManyByCriteria(entityMeta,
                criteria, instance)
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
            ? MysqlService.aRemoveManyByCriteria(conn, entityMeta, criteria)
            : MongoService.aRemoveManyByCriteria(entityMeta, criteria)
    } finally {
        // TODO 清除效率改进
        await aFireEntityRemoved(conn, entityMeta)
    }
}

export async function aRecoverMany(conn: ExecuteContext, entityName: string,
    ids: any[]) {
    const entityMeta = getEntityMeta(entityName)

    try {
        return (entityMeta.db === DB.mysql)
            ? MysqlService.aRecoverMany(conn, entityMeta, ids)
            : MongoService.aRecoverMany(entityMeta, ids)
    } finally {
        await aFireEntityCreated(conn, entityMeta)
    }
}

export async function aFindOneById(conn: ExecuteContext, entityName: string,
    id: any, options?: FindOption) {
    const entityMeta = getEntityMeta(entityName)

    options = options || {}
    const includedFields = options.includedFields || []

    const cacheId = id + "|" + options.repo + "|" + includedFields.join(",")
    const criteria = {_id: id}

    return aWithCache(entityMeta, ["Id", cacheId],
        async() => {
            if (entityMeta.db === DB.mysql)
                return MysqlService.aFindOneByCriteria(conn,
                    entityMeta, criteria, options)
            else if (entityMeta.db === DB.mongo)
                return MongoService.aFindOneByCriteria(entityMeta,
                    criteria, options)
        })
}

export async function aFindOneByCriteria(conn: ExecuteContext,
    entityName: string, criteria: GenericCriteria, options?: FindOption) {
    const entityMeta = getEntityMeta(entityName)

    let includedFields
    if (_.isArray(options)) {
        includedFields = options
    } else {
        options = options || {}
        includedFields = options.includedFields || []
    }

    const cacheId = "OneByCriteria|" + options.repo + "|" + JSON.stringify(
        criteria) + "|" + includedFields.join(",")

    return aWithCache(entityMeta, ["Other", cacheId],
        async() => {
            if (entityMeta.db === DB.mysql)
                return MysqlService.aFindOneByCriteria(conn,
                    entityMeta, criteria, options)
            else if (entityMeta.db === DB.mongo)
                return MongoService.aFindOneByCriteria(entityMeta,
                    criteria, options)
        })
}

export async function aList(conn: ExecuteContext, entityName: string,
    options: ListOption) {
    let { criteria, pageNo, sort } = options
    const { repo, pageSize, includedFields, withoutTotal} = options
    const entityMeta = getEntityMeta(entityName)

    if (!pageNo || pageNo < 1) pageNo = 1
    sort = sort || {}
    criteria = criteria || {}

    const criteriaString = JSON.stringify(criteria)
    const sortString = objectToKeyValuePairString(sort)
    const includedFieldsString = includedFields && includedFields.join(",")

    const cacheId =
        `List|${repo}|${pageNo}|${pageSize}|${criteriaString}|` +
        `${sortString}|${includedFieldsString}`

    // 不对，应该使用类似于 notInListInterface 之类的字段
    // if (!includedFields || includedFields.length === 0) {
    //     includedFields = []
    //     for (let fn in entityMeta.fields) {
    //         let fm = entityMeta.fields[fn]
    //         if (!fm.hideInListPage) includedFields.push(fn)
    //     }
    // }

    return aWithCache(entityMeta, ["Other", cacheId],
        async() => {
            const query = {
                repo,
                entityMeta,
                criteria,
                includedFields,
                sort,
                pageNo,
                pageSize,
                withoutTotal
            }
            return entityMeta.db === DB.mysql
                ? MysqlService.aList(conn, query)
                : MongoService.aList(query)
        })
}

export async function aFindManyByCriteria(conn: ExecuteContext,
    entityName: string, options?: ListOption | string[]) {
    const entityMeta = getEntityMeta(entityName)

    options = (_.isArray(options))
        ? {entityMeta, includedFields: options}
        : (options || {entityMeta})
    options.pageSize = options.pageSize || -1
    options.withoutTotal = true

    return aList(conn, entityName, options)
}

export async function aFindManyByIds(conn: ExecuteContext, entityName: string,
    ids: any[], options: ListOption) {
    const entityMeta = getEntityMeta(entityName)

    options = _.isArray(options)
        ? {includedFields: options, entityMeta}
        : (options || {entityMeta})

    options.criteria = {
        __type: CriteriaType.Relation,
        field: "_id", operator: "in", value: ids
    }
    options.pageSize = -1
    options.withoutTotal = true

    return aList(conn, entityName, options)
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
