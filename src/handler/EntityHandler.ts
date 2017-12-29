// cSpell:words repo

import koa = require("koa")
import _ = require("lodash")

import { aClearAllCache } from "../cache/Cache"
import { UserError } from "../Errors"
import { formatEntityToHttp, getEntityMeta, parseEntity, parseId, parseIds,
    parseListQueryValue } from "../Meta"
import { aCreate, aFindOneByCriteria, aFindOneById as aFindOneByIdService,
    aList, aListHistory, aRemoveManyByCriteria,
    aRestoreHistory, aUpdateOneByCriteria,
    aWithoutTransaction, aWithTransaction } from "../service/EntityService"
import { isUserOrRoleHasFieldAction, splitString,
    stringToBoolean, stringToInt } from "../Util"
import { aInterceptCreate, aInterceptDelete, aInterceptGet, aInterceptList,
    aInterceptUpdate } from "./EntityInterceptor"

export async function aCreateEntity(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName

    const instance = ctx.request.body
    if (!instance) throw new UserError("EmptyOperation")

    const r = await _aCreateEntity(ctx, entityName, instance)

    ctx.body = {id: r.id}
}

export async function aCreateEntitiesInBatch(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName
    const ignoreError = stringToBoolean(ctx.query.ignore)

    const instances = ctx.request.body
    if (!(instances && _.isArray(instances) && instances.length))
        throw new UserError("EmptyOperation")

    const promises = _.map(instances, async i => {
        try {
            const r = await _aCreateEntity(ctx, entityName, i)
            return r.id
        } catch (e) {
            if (ignoreError)
                return null
            else
                throw e
        }
    })

    ctx.body = await Promise.all(promises)
}

export async function _aCreateEntity(ctx: koa.Context,
    entityName: string, instance: any): Promise<CreateResult> {
    const entityMeta = getEntityMeta(entityName)

    if (!entityMeta) throw new UserError("NoSuchEntity")
    if (entityMeta.noCreate) throw new UserError("CreateNotAllow")

    instance = parseEntity(instance, entityMeta)
    removeNoCreateFields(entityMeta, ctx.state.user, instance)

    let fieldCount = 0
    for (const key in instance) {
        const value = instance[key]
        if (_.isNull(value))
            delete instance[key]
        else
            fieldCount++
    }
    if (!fieldCount) throw new UserError("EmptyOperation")

    const operator = ctx.state.user
    instance._createdBy = operator && operator._id

    const r = await aWithTransaction(entityMeta, async conn =>
        aInterceptCreate(entityName, conn, instance, operator, async() =>
            aCreate(conn, entityName, instance)))

    return {id: r.id}
}

export async function aUpdateEntityById(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName
    await _aUpdateEntityById(ctx,
        entityName, ctx.state.params.id, ctx.request.body)
    ctx.status = 204
}

export async function _aUpdateEntityById(ctx: koa.Context, entityName: string,
    id: string, instance: any) {
    const entityMeta = getEntityMeta(entityName)

    if (!entityMeta) throw new UserError("NoSuchEntity")
    if (entityMeta.noEdit) throw new UserError("EditNotAllow")

    id = parseId(id, entityMeta)
    const criteria = {_id: id}

    instance = parseEntity(instance, entityMeta)
    removeNoEditFields(entityMeta, ctx.state.user, instance)

    const operator = ctx.state.user
    instance._modifiedBy = operator && operator._id

    await aWithTransaction(entityMeta, async conn =>
        aInterceptUpdate(entityName, conn, instance, criteria, operator,
            async() =>
                aUpdateOneByCriteria(conn, entityName, criteria, instance)))
}

export async function aUpdateEntityInBatch(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName
    const entityMeta = getEntityMeta(entityName)

    if (!entityMeta) throw new UserError("NoSuchEntity")
    if (entityMeta.noEdit) throw new UserError("EditNotAllow")

    let patch = ctx.request.body

    const idStrings = patch.ids
    delete patch.ids
    if (!(idStrings && idStrings.length > 0))
        throw new UserError("EmptyOperation")
    const ids = parseIds(idStrings, ",")
    if (!(ids && ids.length > 0)) throw new UserError("EmptyOperation")

    patch = parseEntity(patch, entityMeta)
    removeNoEditFields(entityMeta, ctx.state.user, patch)

    const operator = ctx.state.user
    patch._modifiedBy = operator && operator._id

    await aWithTransaction(entityMeta, async conn => {
        for (const id of ids) {
            const criteria = {_id: id}
            await aInterceptUpdate(entityName, conn, patch, criteria, operator,
                async() =>
                    aUpdateOneByCriteria(conn, entityName, criteria, patch))
        }
    })

    ctx.status = 204
}

export async function aDeleteEntityInBatch(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName
    const entityMeta = getEntityMeta(entityName)

    if (!entityMeta) throw new UserError("NoSuchEntity")
    if (entityMeta.noDelete) throw new UserError("DeleteNotAllow")

    let ids = ctx.query && ctx.query._ids
    if (!ids) {
        ctx.status = 400
        return
    }

    ids = splitString(ids, ",")
    ids = parseIds(ids, entityMeta)
    if (!(ids.length > 0)) throw new UserError("EmptyOperation")

    const criteria = {
        __type: "relation", relation: "and",
        items: [{field: "_id", operator: "in", value: ids}]
    }

    const operator = ctx.state.user

    await aWithTransaction(entityMeta, async conn =>
        aInterceptDelete(entityName, conn, operator, criteria, async() =>
            aRemoveManyByCriteria(conn, entityName, criteria)))

    ctx.status = 204
}

export async function aFindOneById(ctx: koa.Context) {
    const entity = await _aFindOneById(ctx, ctx.state.params.entityName,
        ctx.state.params.id)

    if (entity) {
        ctx.body = entity
    } else {
        ctx.status = 404
    }
}

export async function _aFindOneById(ctx: koa.Context, entityName: string,
    id: any) {
    const entityMeta = getEntityMeta(entityName)

    if (!entityMeta) throw new UserError("NoSuchEntity")

    id = parseId(id, entityMeta)
    if (!id) return null

    const operator = ctx.state.user

    const criteria = {_id: id}

    const opt: FindOption = parseFindOneQuery(entityMeta, ctx.query)

    let entity = await aWithoutTransaction(entityMeta, async conn =>
        aInterceptGet(entityName, conn, criteria, operator, async() =>
        aFindOneByIdService(conn, entityName, id, opt)))

    if (entity) {
        removeNotShownFields(entityMeta, ctx.state.user, entity)
        entity = formatEntityToHttp(entity, entityMeta)
        ctx.body = entity
    }

    return entity
}

export async function aListH(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName

    const r = await _aList(ctx, entityName)

    ctx.body = r
}

export async function _aList(ctx: koa.Context, entityName: string,
    queryModifier?: (query: ListOption) => void) {
    const entityMeta = getEntityMeta(entityName)
    if (!entityMeta) throw new UserError("NoSuchEntity")

    const lq = parseListQuery(entityMeta, ctx.query)
    if (queryModifier) queryModifier(lq)

    const operator = ctx.state.user

    const r = await aWithoutTransaction(entityMeta, async conn =>
        aInterceptList(entityName, conn, lq, operator, async() =>
            aList(conn, entityName, lq))) as PagingListResult

    const page = r.page
    removeNotShownFields(entityMeta, ctx.state.user, ...page)

    r.page = _.map(page, i => formatEntityToHttp(i, entityMeta))

    return r
}

export function parseListQuery(entityMeta: EntityMeta, query: any): ListOption {
    if (!query) return {}
    let criteria, sort
    let includedFields = splitString(query._includedFields, ",") || undefined

    const digest = !!query._digest
    if (digest) {
        includedFields = entityMeta.fieldsForDigest || ["_id"]
    }

    const pageNo = stringToInt(query._pageNo, 1)
    let pageSize = stringToInt(query._pageSize, (digest && -1 || 20)) as number
    if (pageSize > 200) pageSize = 200 // TODO 控制量

    // 整理筛选查询条件
    const fastFilter = query._filter
    if (fastFilter) {
        const orList = []
        orList.push({field: "_id", operator: "==", value: fastFilter})

        for (const fieldName in entityMeta.fields) {
            const fieldMeta = entityMeta.fields[fieldName]
            if (fieldMeta.asFastFilter) orList.push({
                field: fieldName,
                operator: "contain",
                value: fastFilter
            })
        }
        criteria = {__type: "relation", relation: "or", items: orList}
    } else {
        if (query._criteria) {
            try {
                criteria = JSON.parse(query._criteria)
            } catch (e) {
                throw new UserError("BadQueryCriteria")
            }
        } else {
            const criteriaList = []
            for (const key in query) {
                const value = query[key]
                if (entityMeta.fields[key]) criteriaList.push({
                    field: key, operator: "==", value
                })
            }

            criteria = criteriaList.length ? {
                __type: "relation", relation: "and", items: criteriaList
            } : null
        }

        if (criteria) {
            parseListQueryValue(criteria, entityMeta)
            criteria.__type = "relation"
        }
    }

    // Log.debug('criteria', criteria)

    // 整理排序所用字段
    if (query._sort) {
        try {
            sort = JSON.parse(query._sort)
        } catch (e) {
            sort = null
        }
    } else {
        const sortBy = query._sortBy || "_modifiedOn"
        const sortOrder = query._sortOrder === "asc" ? 1 : -1
        sort = {[sortBy]: sortOrder}
    }

    return { pageNo, pageSize, criteria, includedFields, sort }
}

/**
 * only _includedFields
 * @param entityMeta entityMeta
 * @param query query
 */
export function parseFindOneQuery(entityMeta: EntityMeta,
        query: any): FindOption {
    const includedFields = splitString(query._includedFields, ",") || undefined
    if (includedFields)
        return {includedFields}
    else
        return {}
}

export async function aSaveFilters(ctx: koa.Context) {
    const entityMeta = getEntityMeta("F_ListFilters")

    const req = ctx.request.body
    if (!req) throw new UserError("EmptyReq", "请求为空")

    const instance = parseEntity(req, entityMeta)
    if (!instance) throw new UserError("EmptyReq", "请求为空")

    const criteria = {name: instance.name, entityName: instance.entityName}
    const includedFields = ["_id", "_version"]

    const lf = await aFindOneByCriteria({}, "F_ListFilters", criteria,
        {includedFields})
    if (lf) {
        await aUpdateOneByCriteria({}, "F_ListFilters", {
            _id: lf._id, _version: lf._version
        }, instance)
    } else {
        await aCreate({}, "F_ListFilters", instance)
    }

    ctx.status = 204
}

export async function aRemoveFilters(ctx: koa.Context) {
    const query = ctx.query
    if (!(query && query.name && query.entityName))
        throw new UserError("Required", "name&entityName")

    await aRemoveManyByCriteria({}, "F_ListFilters", {
        name: query.name,
        entityName: query.entityName
    })

    ctx.status = 204
}

// 过滤掉不显示的字段
export function removeNotShownFields(entityMeta: EntityMeta, user: any,
    ...entities: (EntityValue | null)[]) {
    if (!(entities && entities.length)) return

    const fields = entityMeta.fields

    const removedFieldNames = []
    for (const fieldName in fields) {
        const fieldMeta = fields[fieldName]
        if (fieldMeta.type === "Password") {
            removedFieldNames.push(fieldName)
        } else if (fieldMeta.notShow &&
            !isUserOrRoleHasFieldAction(user, entityMeta.name, fieldName,
                "show")) {
            removedFieldNames.push(fieldName)
        }
    }

    if (!removedFieldNames.length) return

    for (const e of entities) {
        if (!e) continue
        for (const field of removedFieldNames) delete e[field]
    }
}

// 过滤掉不允许创建的字段
export function removeNoCreateFields(entityMeta: EntityMeta, user: any,
    entity: EntityValue) {
    if (!entity) return

    const fields = entityMeta.fields

    const removedFieldNames = []
    for (const fieldName in fields) {
        const fieldMeta = fields[fieldName]
        if (fieldMeta.noCreate && !isUserOrRoleHasFieldAction(user,
            entityMeta.name, fieldName, "create")) {
            removedFieldNames.push(fieldName)
        }
    }

    if (!removedFieldNames.length) return

    for (const field of removedFieldNames) delete entity[field]
}

// 过滤掉不允许编辑的字段
export function removeNoEditFields(entityMeta: EntityMeta, user: any,
    entity: EntityValue) {
    if (!entity) return

    const fields = entityMeta.fields

    const removedFieldNames = []
    for (const fieldName in fields) {
        const fieldMeta = fields[fieldName]
        if ((fieldMeta.noEdit || fieldMeta.editReadonly) &&
            !isUserOrRoleHasFieldAction(user, entityMeta.name, fieldName,
                "edit")) {
            removedFieldNames.push(fieldName)
        }
    }

    if (!removedFieldNames.length) return

    for (const field of removedFieldNames) delete entity[field]
}

export async function aClearCache(ctx: koa.Context) {
    await aClearAllCache()
    ctx.status = 204
}

export async function aListHistoryH(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName
    const entityMeta = getEntityMeta(entityName)
    if (!entityMeta) throw new UserError("NoSuchEntity")

    const operator = ctx.state.user

    const id = parseId(ctx.state.params.id, entityMeta)
    if (!id) throw new UserError("BadId", "BadId")

    const query = ctx.query || {}
    const pageNo = stringToInt(query._pageNo, 1) as number
    let pageSize = stringToInt(query._pageSize, 20) as number
    if (pageSize > 100) pageSize = 100

    const r = await aWithoutTransaction(entityMeta, async conn =>
        aListHistory(conn, entityMeta, id, pageNo, pageSize))

    const page = r.page
    removeNotShownFields(entityMeta, ctx.state.user, ...page)

    r.page = _.map(page, i => formatEntityToHttp(i, entityMeta))

    ctx.body = r
}

export async function aRestoreHistoryH(ctx: koa.Context) {
    const entityName = ctx.state.params.entityName
    const entityMeta = getEntityMeta(entityName)
    if (!entityMeta) throw new UserError("NoSuchEntity")
    if (entityMeta.noEdit) throw new UserError("EditNotAllow")

    const id = parseId(ctx.state.params.id, entityMeta)
    if (!id) throw new UserError("BadId", "BadId")

    const req = ctx.request.body
    const version = req && req._version

    const operator = ctx.state.user

    await aWithTransaction(entityMeta, async conn =>
        aRestoreHistory(conn, entityMeta, id, version, operator._id))

    ctx.status = 204
}
