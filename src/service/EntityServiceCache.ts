import * as _ from "lodash"
import * as mongodb from "mongodb"
import { aGetObject, aSetObject, aUnset } from "../cache/Cache"
import { logSystemError, logSystemInfo } from "../Log"

// 缓存分两类：1、byIdCache：根据 ID 查询单个实体。2、otherCache：其他，包括根据非 ID 查询单个实体。
// 增删改三个操作。增不影响 byIdCache；删和改影响指定 ID 的 byIdCache；
// 但增可能影响所有 otherCache。比如我们查询最新插入一个的实体，新增会导致缓存失效。更新、删除类似。
// TODO 其实还有一个"根据多个ID查询"。增不影响。修改、删除时检查被操作的 ID 是否在这些 ID 中，不在就不需要删除缓存。

export type EntityCreatedListener = (ctx: ExecuteContext, em: EntityMeta)
    => void
export type EntityUpdatedListener = (ctx: ExecuteContext, em: EntityMeta,
    ids?: any[]) => void

const entityCreatedListeners: EntityCreatedListener[] = []
const entityUpdatedListeners: EntityUpdatedListener[] = []
const entityRemovedListeners: EntityUpdatedListener[] = []

export async function aWithCache(entityMeta: EntityMeta, cacheId: string[],
    aQuery: () => any) {
    "use strict"
    const noServiceCache = entityMeta.noServiceCache

    if (noServiceCache) return aQuery()

    const keys = _.concat(["Entity", entityMeta.name], cacheId)
    // console.log("cacheId", cacheId)
    // console.log("keys", keys)
    const cacheItem = await aGetObject(keys)
    if (!_.isNil(cacheItem))
        return _.cloneDeep(cacheItem) // 返回拷贝，以防止污染缓存

    const freshValue = await aQuery()
    if (_.isNil(freshValue)) return freshValue // TODO 空值暂不缓存

    await aSetObject(keys, freshValue)
    return _.cloneDeep(freshValue) // 返回拷贝，以防止污染缓存
}

export function onEntityCreated(asyncListener: EntityCreatedListener) {
    entityCreatedListeners.push(asyncListener)
}

export function onEntityUpdated(asyncListener: EntityUpdatedListener) {
    entityUpdatedListeners.push(asyncListener)
}

export function onEntityRemoved(asyncListener: EntityUpdatedListener) {
    entityRemovedListeners.push(asyncListener)
}

export function onUpdatedOrRemoved(asyncListener: EntityUpdatedListener) {
    entityUpdatedListeners.push(asyncListener)
    entityRemovedListeners.push(asyncListener)
}

export async function aFireEntityCreated(ctx: ExecuteContext,
    entityMeta: EntityMeta) {

    await aUnset(["Entity", entityMeta.name, "Other"])

    for (const asyncListener of entityCreatedListeners) {
        try {
            await asyncListener(ctx, entityMeta)
        } catch (e) {
            logSystemError(e, "fireEntityCreated")
            throw e
        }
    }
}

export async function aFireEntityUpdated(ctx: ExecuteContext,
    entityMeta: EntityMeta, ids?: mongodb.ObjectID[]) {

    await aUnset(["Entity", entityMeta.name, "Other"])
    await aRemoveOneCacheByIds(entityMeta, ids)

    for (const asyncListener of entityUpdatedListeners) {
        try {
            await asyncListener(ctx, entityMeta, ids)
        } catch (e) {
            logSystemError(e, "onEntityUpdated")
            throw e
        }
    }
}

export async function aFireEntityRemoved(ctx: ExecuteContext,
    entityMeta: EntityMeta, ids?: mongodb.ObjectID[]) {

    await aUnset(["Entity", entityMeta.name, "Other"])
    await aRemoveOneCacheByIds(entityMeta, ids)

    for (const asyncListener of entityRemovedListeners) {
        try {
            await asyncListener(ctx, entityMeta, ids)
        } catch (e) {
            logSystemError(e, "onEntityRemoved")
            throw e
        }
    }
}

async function aRemoveOneCacheByIds(entityMeta: EntityMeta,
    ids?: mongodb.ObjectID[]) {
    if (ids) {
        for (const id of ids)
            await aUnset(["Entity", entityMeta.name, "Id", id.toHexString()])
    } else {
        await aUnset(["Entity", entityMeta.name, "Id"])
    }
}
