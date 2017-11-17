import * as mongodb from "mongodb"
import Config from "../Config"
import { getLogger } from "../Log"

const ObjectId = mongodb.ObjectId
const MongoClient = mongodb.MongoClient

class MongoStore {
    private name: string
    private url: string
    private db?: mongodb.Db

    constructor(name: string, url: string) {
        this.name = name
        this.url = url
    }

    async aDatabase() {
        const systemLogger = getLogger("system")

        if (this.db) return this.db

        this.db = await MongoClient.connect(this.url)

        this.db.on("close", () => {
            delete this.db
            systemLogger.info(`MongoDB [${this.name}] closed`)
        })

        this.db.on("error", e => {
            delete this.db
            systemLogger.error(e, `MongoDB [${this.name}] error`)
        })

        this.db.on("reconnect", () => {
            systemLogger.info(`Mongo DB [${this.name}] reconnect`)
        })

        return this.db
    }

    async aDispose() {
        const systemLogger = getLogger("system")

        systemLogger.info(`Closing mongodb [${this.name}]...`)
        if (!this.db) return

        try {
            await this.db.close()
        } catch (e) {
            systemLogger.error(e, `Error on disposing mongodb [${this.name}]`)
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
    const systemLogger = getLogger("system")

    if (!Config.mongoDatabases) {
        systemLogger.warn("No mongo!")
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
    : mongodb.ObjectID | null {
    return r && r.insertedId || null
}

export function getUpdateResult(r: mongodb.UpdateWriteOpResult) {
    return r && {matchedCount: r.matchedCount, modifiedCount: r.modifiedCount}
}

export function isIndexConflictError(e: mongodb.MongoError) {
    return e.code === 11000
}

type ObjectIdOrStringOrNil = mongodb.ObjectID | string | null | undefined

export function stringToObjectId(s: ObjectIdOrStringOrNil) {
    if (!s) return s

    if (s instanceof ObjectId)
        return s
    else
        return new ObjectId(s)
}

// 如果无法解析 ObjectID 返回 undefined；如果本身是 null/undefined 原样返回
export function stringToObjectIdSilently(s: ObjectIdOrStringOrNil) {
    try {
        return exports.stringToObjectId(s)
    } catch (e) {
        return undefined
    }
}

// 忽略无法解析的
export function stringArrayToObjectIdArraySilently(
    stringArray: ObjectIdOrStringOrNil[]) {
    if (!stringArray) return []

    const ids = []
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

    if (criteria.relation === CriteriaRelation.OR) {
        const items = []
        if (criteria.items) {
            for (const item of criteria.items) {
                const mc = {}
                convertMongoCriteria(item, mc)
                if (mc) items.push(mc)
            }
        }
        mongoCriteria.$or = items
    } else if (criteria.relation === CriteriaRelation.AND) {
        if (criteria.items) {
            for (const item of criteria.items)
                convertMongoCriteria(item, mongoCriteria)
        }
    } else if (criteria.field) {
        const operator = criteria.operator
        const value = criteria.value
        const field = criteria.field
        const fc = mongoCriteria[field] = mongoCriteria[field] || {}
        switch (operator) {
        case "==":
            mongoCriteria[field] = value
            break
        case "!=":
            // TODO 对于部分运算符要检查 comparedValue 不为 null/undefined/NaN
            fc.$ne = value
            break
        case ">":
            fc.$gt = value
            break
        case ">=":
            fc.$gte = value
            break
        case "<":
            fc.$lt = value
            break
        case "<=":
            fc.$lte = value
            break
        case "in":
            fc.$in = value
            break
        case "nin":
            fc.$nin = value
            break
        case "start":
            fc.$regex = "^" + value
            break
        case "end":
            fc.$regex = value + "$"
            break
        case "contain":
            fc.$regex = value
        }
    }
}
