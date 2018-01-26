import { logSystemInfo } from "../Log"
import { DB, getEntities } from "../Meta"
import { aConnect, EnhancedConnection } from "./MySqlStore"

// 让表结构与实体结构一致
// 不会删除表、列：删除表、列需谨慎，不要自动
// 修改表结构不需要事务，自动提交
export async function aSyncSchema() {
    const entities = getEntities()
    const entityNames = Object.keys(entities)

    const conn = await aConnect()
    try {
        for (const entityName of entityNames) {
            const entityMeta = entities[entityName]
            if (entityMeta.db !== DB.mysql) continue

            const table = entityMeta.tableName || entityMeta.name
            const existed = await aTableExists(table, conn)
            if (!existed) {
                // 新建表
                logSystemInfo("create table for " + entityName)
                await aCreateTable(table, entityMeta, conn)
            } else {
                // 修改表（如果需要）
                const fieldNames = Object.keys(entityMeta.fields)
                for (const fieldName of fieldNames) {
                    const fieldMeta = entityMeta.fields[fieldName]
                    const colExisted = await aColumnExists(table, fieldName,
                        conn)
                    if (!colExisted) {
                        logSystemInfo("add column " + fieldName + " for "
                            + entityName)
                        await aAddColumn(table, fieldMeta, conn)
                    }
                }
            }
        }
    } finally {
        conn.release()
    }
}

async function aCreateTable(table: string, entityMeta: EntityMeta,
    conn: EnhancedConnection) {

    let sql = "CREATE TABLE ?? ( "
    const columns: string[] = []
    const args: string[] = [table]

    const fieldNames = Object.keys(entityMeta.fields)

    for (const fieldName of fieldNames) {
        const fieldMeta = entityMeta.fields[fieldName]
        columns.push("?? " + buildColumnDefinition(fieldMeta))
        args.push(fieldName)
    }

    sql = sql + columns.join(", ") + ", PRIMARY KEY (`_id`))"
    await conn.aQuery(sql, args)
}

async function aAddColumn(table: string, fieldMeta: FieldMeta,
    conn: EnhancedConnection) {

    const sql = "ALTER TABLE ?? Add Column ?? "
        + buildColumnDefinition(fieldMeta)
    const args = [table, fieldMeta.name]

    await conn.aQuery(sql, args)
}

function buildColumnDefinition(fieldMeta: FieldMeta) {
    const sqlType = fieldMeta.sqlColM
        ? `${fieldMeta.persistType}(${fieldMeta.sqlColM})`
        : fieldMeta.persistType
    const notNull = fieldMeta.required && "NOT NULL" || ""
    return `${sqlType} ${notNull}`
}

async function aTableExists(tableName: string , conn: EnhancedConnection) {
    const r = await conn.aRead("SHOW TABLES LIKE ?", [tableName])
    return r && r.length ? true : false
}

async function aColumnExists(tableName: string, columnName: string,
    conn: EnhancedConnection) {
    const r = await conn.aRead("SHOW COLUMNS FROM ?? LIKE ?",
        [tableName, columnName])
    return r && r.length ? true : false
}

// gRenameTable = (oldName, newName, conn)->
//     yield conn.aQuery "alter table ?? rename ??", [oldName, newName]

// gDropTable = (name, conn)->
//     yield conn.aQuery "drop table ??", [name]
