// cSpell:words mysqls

import _ = require("lodash")
import mysql = require("mysql")
import Config from "../Config"
import { UserError } from "../Errors"
import { logSystemError } from "../Log"
// import Meta from "../Meta"

export interface MySQLListOptions {
    criteria: GenericCriteria
    includedFields?: string[]
    sort?: { [k: string]: number }
    pageNo?: number
    pageSize?: number
    paging?: boolean
}

const stores: { [name: string]: mysql.Pool } = {}

export function init() {
    const mysqlsConfigs = Config.mysqls
    if (!mysqlsConfigs) return

    for (const config of mysqlsConfigs) {
        const pool = mysql.createPool({
            connectionLimit: config.connectionLimit || 3,
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database
        })
        stores[config.name] = pool
    }
}

export async function aDispose() {
    const storeNames = Object.keys(stores)
    const ps = storeNames.map(store => {
        const pool = stores[store]
        return new Promise((resolve, reject) => {
            pool.end(err => {
                if (err) {
                    // 只记录错误
                    logSystemError(err, "dispose mysql")
                    resolve()
                } else {
                    resolve()
                }
            })
        })
    })
    return Promise.all(ps)
}

export async function aConnect(storeName?: string | null) {
    storeName = storeName || "main"
    const pool = stores[storeName]
    if (!pool) throw new Error("No MySQL Store " + storeName)

    return new Promise<EnhancedConnection>((resolve, reject) => {
        pool.getConnection((err, conn) => {
            if (err) {
                reject(err)
            } else {
                resolve(new EnhancedConnection(conn))
            }
        })
    })
}

function toSelectClause(array: string[]) {
    const fields = array.map(f => mysql.escapeId(f))
    return fields.join(",")
}

function objectToWhereClause(object: { [k: string]: any }, values: any[]) {
    const conditions: string[] = []
    const keys = Object.keys(object)
    for (const key of keys) {
        conditions.push(`${mysql.escapeId(key)} = ?`)
        values.push(object[key])
    }
    return conditions.join(" AND ")
}

function criteriaToWhereClause(criteria: GenericCriteria,
    sqlValues: any[]): string | null {

    if (criteria.relation) {
        const items: string[] = []
        if (criteria.items && criteria.items.length) {
            for (const item of criteria.items) {
                const i = criteriaToWhereClause(item, sqlValues)
                if (i) items.push(i)
            }
            if (!items.length) return null
        }

        if (criteria.relation === "or") {
            return "(" + items.join(" OR ") + ")"
        } else {
            return items.join(" AND ")
        }
    } else if (criteria.field) {
        const operator = criteria.operator
        const comparedValue = criteria.value
        const field = mysql.escapeId(criteria.field)
        switch (operator) {
            case "==":
                // TODO 对于部分运算符要检查 comparedValue 不为 null/undefined/NaN
                sqlValues.push(comparedValue)
                return field + " = ?"
            case "!=":
                sqlValues.push(comparedValue)
                return field + " <> ?"
            case ">":
                sqlValues.push(comparedValue)
                return field + " > ?"
            case ">=":
                sqlValues.push(comparedValue)
                return field + " >= ?"
            case "<":
                sqlValues.push(comparedValue)
                return field + " < ?"
            case "<=":
                sqlValues.push(comparedValue)
                return field + " <= ?"
            case "in":
                return field + " IN " + buildInClause(comparedValue, sqlValues)
            case "nin":
                return field + " NOT IN "
                    + buildInClause(comparedValue, sqlValues)
            case "start":
                sqlValues.push(comparedValue + "%")
                return field + " LIKE ?"
            case "end":
                sqlValues.push("%" + comparedValue)
                return field + " LIKE ?"
            case "contain":
                sqlValues.push("%" + comparedValue + "%")
                return field + " LIKE ?"
            default:
                return null
        }
    }

    return null
}

function buildInClause(inList: any[] | null, sqlValues: any[]) {
    if (!(inList && inList.length)) return ""

    const placeholders: string[] = []
    for (const i of inList) {
        placeholders.push("?")
        sqlValues.push(i)
    }
    return "(" + placeholders.join(",") + ")"
}

function numberedToOrderClause(numbered: { [k: string]: any }) {
    const orders: string[] = []
    const keys = Object.keys(numbered)
    for (const key of keys) {
        const value = numbered[key]
        orders.push(mysql.escapeId(key) + " " + (value < 0 && "DESC" || "ASC"))
    }
    return orders.join(",")
}

function objectToSetClause(object: { [k: string]: any }, values: any[]) {
    const set = []
    const keys = Object.keys(object)
    for (const key of keys) {
        set.push(`${mysql.escapeId(key)} = ?`)
        values.push(object[key])
    }
    return set.join(",")
}

function listCriteriaFields(criteria: GenericCriteria) {
    const list: string[] = []
    _listCriteriaFields(criteria, list)
    return _.uniq(list)
}

function _listCriteriaFields(criteria: GenericCriteria, list: string[]) {
    if (criteria.relation) {
        if (criteria.items) {
            for (const item of criteria.items)
                _listCriteriaFields(criteria, list)
        }
    } else if (criteria.field) {
        list.push(criteria.field)
    }
}

export class EnhancedConnection {
    written = false

    constructor(private conn: mysql.PoolConnection) {
    }

    release() {
        this.conn.release()
    }

    async aQuery(sql: string, values?: any[]) {
        return new Promise<any>((resolve, reject) => {
            this.conn.query(sql, values, (err, results) => {
                if (err) return reject(err)
                resolve(results)
            })
        })
    }

    async aBeginTransaction() {
        if (this.written) return
        return new Promise<any>((resolve, reject) => {
            this.conn.beginTransaction(err => {
                if (err) return reject(err)
                resolve(true)
            })
        })
    }

    async aCommit() {
        return new Promise((resolve, reject) => {
            this.conn.commit(err => {
                if (err) { reject(err) } else { resolve(true) }
            })
        })
    }

    async aRollback() {
        return new Promise((resolve, reject) => {
            this.conn.rollback(err => {
                if (err) { reject(err) } else { resolve(true) }
            })
        })
    }

    async aRead(sql: string, values: any[]) {
        return this.aQuery(sql, values)
    }

    // 若未开启事务，先开启一个事务
    async aWrite(sql: string, values: any[]) {
        if (!this.written) await this.aBeginTransaction()
        this.written = true
        return this.aQuery(sql, values)
    }

    async aFind(table: string, options: MySQLListOptions) {
        const { criteria, includedFields, sort,
            pageNo, pageSize, paging } = options

        const values: any[] = []
        let select = "*"
        let where = ""
        let orderBy = ""
        let skipLimit = ""

        // 需要加上在 where 子句中出现的列
        const criteriaFields = listCriteriaFields(criteria)
        const selectedFields = includedFields ?
            criteriaFields.concat(includedFields) : criteriaFields

        if (selectedFields.length) {
            select = toSelectClause(_.uniq(selectedFields))
        }

        if (criteria && _.size(criteria)) {
            const w = criteriaToWhereClause(criteria, values)
            if (w) where = "WHERE " + w
        }

        if (sort)
            orderBy = "ORDER BY " + numberedToOrderClause(sort)

        if (pageSize && pageSize > 0) {
            const no = (pageNo && pageNo >= 1) ? pageNo : 1
            skipLimit = `SKIP ${(no - 1) * pageSize} LIMIT ${pageSize}`
        }

        const sql = `select ${select} `
            + `from ${table} ${where} ${orderBy} ${skipLimit}`
        const list = await this.aRead(sql, values)

        if (!paging) {
            return list
        } else {
            const sql2 = `select COUNT(1) as count from ${table} ${where}`
            const r = await this.aRead(sql2, values)
            return { total: r[0].count, page: list, pageNo, pageSize }
        }
    }

    async aListByIds(table: string, ids: any[]) {
        if (!ids.length) return []

        const sqlValues: any[] = []
        const inClause = buildInClause(ids, sqlValues)
        if (!inClause) return []

        const sql = `select * from ${table} where _id IN ${inClause}`
        return this.aRead(sql, sqlValues)
    }

    async aFindOneByCriteria(table: string, criteria: GenericCriteria,
        includedFields?: string[]) {
        const query = {criteria, includedFields, pageNo: 1, pageSize: 1,
            paging: false}
        const list = await this.aFind(table, query)
        return list.length && list[0] || null
    }

    async aInsertOne(table: string, object: any, keys?: string[]) {
        return this.aInsertMany(table, [object], keys)
    }

    async aInsertMany(table: string, objects: any[], keys?: string[]) {
        if (!objects.length) return null
        if (!(keys && keys.length)) {
            let fields: string[] = []
            for (const o of objects) {
                fields = fields.concat(_.keys(o))
            }
            keys = _.uniq(fields)
        }
        if (!keys.length) return null

        const columns = keys.map(k => mysql.escapeId(k))

        const placeholders: string[] = []
        const sqlValues: any[] = []
        for (const object of objects) {
            const placeholders2: string[] = []
            for (const key of keys) {
                placeholders2.push("?")
                sqlValues.push(object[key])
            }
            placeholders.push(`(${placeholders2.join(",")})`)
        }

        const sql = `insert into ${table}(${columns.join(",")})`
            + ` values ${placeholders.join(",")}`
        return this.aWrite(sql, sqlValues)
    }

    async aUpdateByObject(table: string, criteriaObject: any, patch: any) {
        if (!_.size(criteriaObject)) return null
        if (!_.size(patch)) return null

        const sqlValues: any[] = []
        const set = objectToSetClause(patch, sqlValues)
        const where = objectToWhereClause(criteriaObject, sqlValues)

        const sql = `update ${table} set ${set} where ${where}`
        return this.aWrite(sql, sqlValues)
    }

    async aDeleteManyByIds(table: string, ids: any[]) {
        if (!ids.length) return

        const sqlValues: any[] = []
        const inClause = buildInClause(ids, sqlValues)
        const sql = `delete * from ${table} where _id IN ${inClause}`

        return this.aWrite(sql, sqlValues)
    }

    async aDeleteManyByCriteria(table: string, criteria: GenericCriteria) {
        const sqlValues: any[] = []
        let where = ""
        if (criteria && _.size(criteria)) {
            const w = criteriaToWhereClause(criteria, sqlValues)
            if (w) where = "WHERE " + w
        } else {
            // 先消除全删除的风险！！
            throw new UserError("Deleting ALL is forbidden")
        }

        const sql = `delete * from ${table} ${where}`

        return this.aWrite(sql, sqlValues)
    }
}

function autoCommit(storeName: string,
    aWork: (conn: EnhancedConnection) => Promise<any>) {

    return async function() {
        const conn = await aConnect(storeName)
        try {
            await conn.aBeginTransaction()
            const r = await aWork(conn)
            await conn.aCommit()
            return r
        } catch (e) {
            try {
                await conn.aRollback()
            } catch (e2) {
                logSystemError(e2, "autoCommit, rollback")
            }
            throw e
        } finally {
            conn.release()
        }
    }
}

// 按需创建事务
export async function aUse(storeName: string,
    aWork: (conn: EnhancedConnection) => Promise<any>) {

    const conn = await aConnect(storeName)
    try {
        const r = await aWork(conn)
        if (conn.written) {
            await conn.aCommit()
        }
        return r
    } catch (e) {
        if (conn.written) {
            try {
                await conn.aRollback()
            } catch (e2) {
                logSystemError(e2, "autoCommit, rollback")
            }
        }
        throw e
    } finally {
        conn.release()
    }
}

export function isIndexConflictError(e: any) {
    return e.code === "ER_DUP_ENTRY"
}
