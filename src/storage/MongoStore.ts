import * as mongodb from "mongodb"
import Config from "../Config"
import { logSystemError, logSystemInfo } from "../Log"

const MongoClient = mongodb.MongoClient

export class MongoStore {
    private name: string
    private url: string
    private db?: mongodb.Db

    constructor(name: string, url: string) {
        this.name = name
        this.url = url
    }

    async aDatabase() {
        if (this.db) return this.db

        this.db = await MongoClient.connect(this.url)

        this.db.on("close", () => {
            delete this.db
            logSystemInfo(`MongoDB [${this.name}] closed`)
        })

        this.db.on("error", e => {
            delete this.db
            logSystemError(e, `MongoDB [${this.name}] error`)
        })

        this.db.on("reconnect", () => {
            logSystemInfo(`Mongo DB [${this.name}] reconnect`)
        })

        return this.db
    }

    async aDispose() {
        logSystemInfo(`Closing mongodb [${this.name}]...`)
        if (!this.db) return

        try {
            await this.db.close()
        } catch (e) {
            logSystemError(e, `Error on disposing mongodb [${this.name}]`)
        }
    }
}

const stores: {[k: string]: MongoStore} = {}

export function getStore(key: string) {
    return stores[key]
}

export function getMainStore() {
    return stores.main
}

export function init() {
    if (!Config.mongoDatabases) {
        logSystemError("No mongo!")
        return
    }
    for (const db of Config.mongoDatabases) {
        stores[db.name] = new MongoStore(db.name, db.url)
    }
}

export async function aDispose() {
    return Promise.all(Object.keys(stores)
        .map(dbName => stores[dbName].aDispose()))
}

export function getInsertedIdObject(r: mongodb.InsertOneWriteOpResult)
    : mongodb.ObjectId {
    return r.insertedId
}

export function getUpdateResult(r: mongodb.UpdateWriteOpResult) {
    return r && {matchedCount: r.matchedCount, modifiedCount: r.modifiedCount}
}

export function isIndexConflictError(e: mongodb.MongoError) {
    return e.code === 11000
}

export type ObjectIdOrStringOrNil = mongodb.ObjectID | string | null | undefined

export function stringToObjectId(s: string | mongodb.ObjectId)
    : mongodb.ObjectId {
    if (s instanceof mongodb.ObjectId)
        return s
    else
        return new mongodb.ObjectId(s)
}

// 如果无法解析 ObjectID 返回 undefined；如果本身是 null/undefined 原样返回
export function stringToObjectIdSilently(s: ObjectIdOrStringOrNil)
    : mongodb.ObjectId | undefined {
    if (!s) return undefined
    try {
        return stringToObjectId(s)
    } catch (e) {
        return undefined
    }
}

// 忽略无法解析的
export function stringArrayToObjectIdArraySilently(
    stringArray: ObjectIdOrStringOrNil[]): mongodb.ObjectId[] {
    if (!stringArray) return []

    const ids: mongodb.ObjectId[] = []
    for (const s of stringArray) {
        const id = stringToObjectIdSilently(s)
        if (id) ids.push(id)
    }
    return ids
}

// 将通用查询转转换为 mongo 的查询对象
export function toMongoCriteria(criteria: AnyCriteria): MongoCriteria {
    if (!criteria) return {}

    const __type = criteria.__type
    delete criteria.__type

    const mongoCriteria = {}

    switch (__type) {
    case "mongo":
        return criteria
    case "relation":
        convertMongoCriteria(criteria as GenericCriteria, mongoCriteria)
        return mongoCriteria
    default:
        return criteria
    }
}

function convertMongoCriteria(criteria: GenericCriteria,
    mongoCriteria: any) {
    if (!criteria) return

    if (criteria.relation === "or") {
        const items = []
        if (criteria.items) {
            for (const item of criteria.items) {
                const mc = {}
                convertMongoCriteria(item, mc)
                if (mc) items.push(mc)
            }
        }
        mongoCriteria.$or = items
    } else if (criteria.relation === "and") {
        if (criteria.items) {
            for (const item of criteria.items)
                convertMongoCriteria(item, mongoCriteria)
        }
    } else if (criteria.field) {
        const operator = criteria.operator
        const value = criteria.value
        const field = criteria.field
        switch (operator) {
        case "==":
            mongoCriteria[field] = value
            break
        case "!=":
            // TODO 对于部分运算符要检查 comparedValue 不为 null/undefined/NaN
            mergeFieldCriteria(mongoCriteria, field, {$ne: value})
            break
        case ">":
            mergeFieldCriteria(mongoCriteria, field, {$gt: value})
            break
        case ">=":
            mergeFieldCriteria(mongoCriteria, field, {$gte: value})
            break
        case "<":
            mergeFieldCriteria(mongoCriteria, field, {$lt: value})
            break
        case "<=":
            mergeFieldCriteria(mongoCriteria, field, {$lte: value})
            break
        case "in":
            mergeFieldCriteria(mongoCriteria, field, {$in: value})
            break
        case "nin":
            mergeFieldCriteria(mongoCriteria, field, {$nin: value})
            break
        case "start":
            if (value)
                mergeFieldCriteria(mongoCriteria, field, {$regex: "^" + value})
            break
        case "end":
            if (value)
                mergeFieldCriteria(mongoCriteria, field, {$regex: value + "$"})
            break
        case "contain":
            if (value)
                mergeFieldCriteria(mongoCriteria, field, {$regex: value})
            break
        }
    }
}

function mergeFieldCriteria(mongoCriteria: any, field: string, add: any) {
    const fc = mongoCriteria[field]
    if (fc) {
        Object.assign(fc, add)
    } else {
        mongoCriteria[field] = add
    }
}
