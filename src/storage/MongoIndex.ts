import { logSystemError } from "../Log"
import { DB, getEntities } from "../Meta"
import { getStore } from "./MongoStore"

// 在执行数据库创建指定实体的元数据
export  async function aSyncWithMeta() {
    const entities = getEntities()
    const entityNames = Object.keys(entities)

    // 每个实体的索引独立事务进行操作

    for (const entityName of entityNames) {
        const entityMeta = entities[entityName]
        if (entityMeta.db !== DB.mongo) continue

        try {
            const db = await getStore(entityMeta.dbName || "main").aDatabase()
            const tableName = entityMeta.tableName || entityMeta.name
            const c = db.collection(tableName)
            const indexConfigs = entityMeta.mongoIndexes || []
            // 创建索引
            for (const ic of indexConfigs) {
                const fields: {[s: string]: number} = {}
                for (const f of ic.fields) {
                    fields[f.field] = f.order === "+" ? 1 : -1
                }
                const options = {name: tableName + "_" + ic.name,
                    unique: !!ic.unique,
                    sparse: !!ic.sparse
                }

                await c.createIndex(fields, options)
            }
            // TODO 删除不再需要的索引
            // 小心不要删除主键！！
            // existedIndexes = await c.listIndexes().toArray()
        } catch (e) {
            logSystemError(e, "create mongo index", entityName)
        }
    }
}
