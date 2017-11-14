const Meta = require("../Meta")
import { getLogger } from "../Log"
import { getStore } from "./MongoStore"

// 在执行数据库创建指定实体的元数据
exports.aSyncWithMeta = async function() {
    const systemLogger = getLogger("system")

    const entities = Meta.getEntities()
    for (const entityName in entities) {
        if (!entities.hasOwnProperty(entityName)) continue
        const entityMeta = entities[entityName]
        if (entityMeta.db !== Meta.DB.mongo) continue

        try {
            const db = await getStore(entityMeta.dbName).aDatabase()
            const tableName = entityMeta.tableName
            const c = db.collection(tableName)
            const currentIndexes = entityMeta.mongoIndexes || []
            // 创建索引
            for (const i of currentIndexes) {
                const fieldsArray = i.fields.split(",")
                const fields: {[s: string]: number} = {}
                for (const f of fieldsArray) {
                    const fc = f.split(":")
                    fields[fc[0]] = parseInt(fc[1], 10)
                }
                const options = {name: tableName + "_" + i.name,
                    unique: !!i.unique,
                    sparse: !!i.sparse
                }

                await c.createIndex(fields, options)
            }
            // TODO 删除不再需要的索引
            // 小心不要删除主键！！
            // existedIndexes = await c.listIndexes().toArray()
        } catch (e) {
            systemLogger.error(e, "create mongo index", entityName)
        }
    }
}
