import mysql = require("mysql")
import { logSystemError } from "../Log"
import { DB, getEntities } from "../Meta"
import { aUse, EnhancedConnection } from "./MySqlStore"

export async function aSyncWithMeta() {
    const entities = getEntities()
    const entityNames = Object.keys(entities)

    // 每个实体的索引独立事务进行操作

    for (const entityName of entityNames) {
        const entityMeta = entities[entityName]
        if (entityMeta.db !== DB.mysql) continue

        const tableName = entityMeta.tableName || entityMeta.name
        const indexConfigs = entityMeta.mysqlIndexes || []
        const storeName = entityMeta.dbName || "main"

        try {
            await aUse(storeName, async conn => {
                await aCreateEntityIndexes(conn, tableName, indexConfigs)
            })
        } catch (e) {
            logSystemError(e, "mysql indexes")
        }
    }
}

async function aCreateEntityIndexes(conn: EnhancedConnection,
    tableName: string, indexConfigs: MySQLIndex[]) {

    const r = await conn.aRead("show index from "
        + mysql.escapeId(tableName), [])
    const existedIndexNames = r.map((i: any) => i.Key_name.toLowerCase())
    for (const ic of indexConfigs) {
        if (existedIndexNames.indexOf(ic.name.toLowerCase()) >= 0)
            continue

        const fields: string[] = []
        for (const f of ic.fields) {
            const order = f.order === "+" ? "ASC" : "DESC"
            fields.push(mysql.escapeId(f.field) + " " + order)
        }
        const fieldsListStr = fields.join(", ")

        const unique = ic.unique && "UNIQUE" || ""
        const indexType = ic.indexType && ic.indexType || ""
        const sql = `create ${unique} index `
            + `${mysql.escapeId(ic.name)} ${indexType} `
            + `on ${mysql.escapeId(tableName)}(${fields})`
        await conn.aWrite(sql, [])
    }

    // TODO 删除不再需要的索引
    // 小心不要删除主键！！
}
