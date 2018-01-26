import { logSystemInfo } from "../Log"
import { DB, getEntities, ObjectIdStringLength } from "../Meta"
import { aConnect, EnhancedConnection } from "./MySqlStore"

interface FieldsMap {[fn: string]: FieldMeta }

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

            // 主表
            const table = entityMeta.tableName || entityMeta.name
            await aAnalyseTable(table, entityMeta.fields, conn)

            // 历史表
            const historyTable = table + "_history"
            const historyFields = {...entityMeta.fields}
            const oldIdMeta = {...historyFields._id}
            oldIdMeta.name = "_oldId"
            historyFields._oldId = oldIdMeta
            historyFields._id = {name: "_id", type: "String", label: "ID",
                persistType: "char", sqlColM: ObjectIdStringLength}
            await aAnalyseTable(historyTable, historyFields, conn)
        }
    } finally {
        conn.release()
    }
}

async function aAnalyseTable(table: string, fields: FieldsMap,
    conn: EnhancedConnection) {

    const existed = await aTableExists(table, conn)
    if (!existed) {
        // 新建表
        logSystemInfo("create table " + table)
        await aCreateTable(table, fields, conn)
    } else {
        // 修改表（如果需要）
        const fieldNames = Object.keys(fields)
        for (const fieldName of fieldNames) {
            const fieldMeta = fields[fieldName]
            const colExisted = await aColumnExists(table, fieldName,
                conn)
            if (!colExisted) {
                logSystemInfo("add column " + fieldName + " to "
                    + table)
                await aAddColumn(table, fieldMeta, conn)
            }
        }
    }
}

async function aCreateTable(table: string, fields: FieldsMap,
    conn: EnhancedConnection) {

    let sql = "CREATE TABLE ?? ( "
    const columns: string[] = []
    const args: string[] = [table]

    const fieldNames = Object.keys(fields)

    for (const fieldName of fieldNames) {
        const fieldMeta = fields[fieldName]
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
    const defaultValue = fieldMeta.persistType === "timestamp"
        ? "DEFAULT CURRENT_TIMESTAMP " : ""
    return `${sqlType} ${notNull} ${defaultValue}`
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
