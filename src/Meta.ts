// cSpell:words upsert repo

import * as crypto from "crypto"
import * as _ from "lodash"
import mongodb = require("mongodb")
import Config from "./Config"
import { SystemError } from "./Errors"
import { extension } from "./Extension"
import { aReadJSON, aWriteJSON } from "./FileUtil"
import { logSystemError, logSystemInfo } from "./Log"
import { getMainStore, stringToObjectIdSilently } from "./storage/MongoStore"
import { dateToLong, longToDate, stringToBoolean, stringToFloat,
    stringToInt } from "./Util"

export const DB = {mongo: "mongodb", mysql: "mysql", none: "none"}

export const ObjectIdStringLength = 24

// 字段逻辑类型（应用层类型）
export const FieldDataTypes = ["ObjectId", "String", "Password", "Boolean",
    "Int", "Float",
    "Date", "Time", "DateTime",
    "Image", "File",
    "Component", "Reference", "Object"]

// MongoDB存储类型
const MongoPersistTypes = ["ObjectId", "String", "Boolean", "Number",
    "Date", "Document"]

const MySQLPersistTypes = ["varchar", "char", "blob", "text",
    "int", "bit", "tinyint", "bigint", "decimal", "float", "double",
    "datetime", "date", "time", "timestamp"]

export const AllPersistTypes = MongoPersistTypes.concat(MySQLPersistTypes)

export const InputTypes = ["Text", "Password", "TextArea", "RichText", "JSON",
    "Select", "Check", "Int", "Float", "CheckList",
    "Date", "Time", "DateTime", "File", "Image",
    "InlineComponent", "PopupComponent", "TabledComponent", "Reference"]

export const actions = {}

function isDateOrTimeType(fieldType: string) {
    return fieldType === "Date" || fieldType === "Time" ||
        fieldType === "DateTime"
}

let entities: {[k: string]: EntityMeta}

const MetaStoreId = new mongodb.ObjectId().toString()

export function getEntityMeta(name: string) {
    const e = entities[name]
    if (!e) throw new Error("No such entity meta: " + name)
    return e
}

export function getEntities() {
    return entities
}

export function getMetaForFront() {
    return {entities}
}

export async function aLoad(extraEntities: {[k: string]: EntityMeta}) {
    try {
        entities = await aReadJSON(Config.metaFile) as any
    } catch (e) {
        logSystemError("No Meta File")
        entities = {}
    }

    initSystemMeta(extraEntities)
    Object.assign(entities, SystemEntities)

    logSystemInfo("Meta loaded")
}

export async function aSaveEntityMeta(entityName: string,
    entityMeta: EntityMeta) {
    entityMeta._modifiedOn = new Date()

    entities[entityName] = entityMeta

    await aWriteJSON(Config.metaFile, entities)
}

export async function aRemoveEntityMeta(entityName: string) {
    const db = await getMainStore().aDatabase()
    const c = db.collection("F_EntityMeta")
    await c.remove({name: entityName})

    delete entities[entityName]

    await aWriteJSON("../meta.json", entities)
}

// 将 HTTP 输入的实体或组件值规范化
// 过滤掉元数据中没有的字段
export function parseEntity(entityInput: EntityValue, entityMeta: EntityMeta) {
    if (!entityInput) return entityInput
    if (!_.isObject(entityInput)) return undefined
    const entityValue: EntityValue = {}
    const fields = entityMeta.fields
    Object.keys(fields).forEach(fName => {
        const fMeta = fields[fName]
        const fv = parseFieldValue(entityInput[fName], fMeta)
        // undefined / NaN 去掉，null 保留！
        if (!(_.isUndefined(fv) || _.isNaN(fv))) entityValue[fName] = fv
    })

    return entityValue
}

// 将 HTTP 输入的查询条件中的值规范化
export function parseListQueryValue(criteria: GenericCriteria,
    entityMeta: EntityMeta) {
    // 如果输入的值有问题，可能传递到下面的持久层，如 NaN, undefined, null
    if (criteria.relation)
        if (criteria.items)
            for (const item of criteria.items)
                parseListQueryValue(item, entityMeta)
    else if (criteria.field) {
        const fieldMeta = entityMeta.fields[criteria.field]
        criteria.value = parseFieldValue(criteria.value, fieldMeta)
    }
}

// 将 HTTP 输入的字段值规范化，value 可以是数组
export function parseFieldValue(value: any, fieldMeta?: FieldMeta): any {
    if (!fieldMeta) throw new SystemError("NoFieldMeta", "")
    // null / undefined 语义不同
    if (_.isNil(value)) return value // null/undefined 原样返回

    // for 循环放在 if 内为提高效率
    if (isDateOrTimeType(fieldMeta.type)) {
        if (_.isArray(value))
            return _.map(value, longToDate)
        else
            return longToDate(value)
    } else if (fieldMeta.type === "ObjectId") {
        if (_.isArray(value))
            return _.map(value,
                stringToObjectIdSilently) // null 值不去
        else
            return stringToObjectIdSilently(value)
    } else if (fieldMeta.type === "Reference") {
        if (!fieldMeta.refEntity)
            throw new Error(`No ref entity for field ${fieldMeta.name}`)
        const refEntityMeta = getEntityMeta(fieldMeta.refEntity)
        if (!refEntityMeta)
            throw new Error(`No ref entity [${fieldMeta.refEntity}]. ` +
                `Field ${fieldMeta.name}.`)

        const idMeta = refEntityMeta.fields._id
        return parseFieldValue(value, idMeta)
    } else if (fieldMeta.type === "Boolean")
        if (_.isArray(value))
            return _.map(value, stringToBoolean)
        else
            return stringToBoolean(value)
    else if (fieldMeta.type === "Int")
        if (_.isArray(value))
            return _.map(value, stringToInt)
        else
            return stringToInt(value)
    else if (fieldMeta.type === "Float")
        if (_.isArray(value))
            return _.map(value, stringToFloat)
        else
            return stringToFloat(value)
    else if (fieldMeta.type === "Component") {
        if (!fieldMeta.refEntity)
            throw new Error(`No ref entity for field ${fieldMeta.name}`)
        const refEntityMeta = getEntityMeta(fieldMeta.refEntity)
        if (!refEntityMeta)
            throw new Error(`No ref entity [${fieldMeta.refEntity}].` +
                `Field ${fieldMeta.name}.`)

        if (_.isArray(value))
            return _.map(value, i => parseEntity(i, refEntityMeta))
        else
            return parseEntity(value, refEntityMeta)
    } else if (fieldMeta.type === "Password") {
        if (!value) return undefined // 不接受空字符串

        if (_.isArray(value))
            return _.map(value, hashPassword)
        else
            return hashPassword(value)
    } else
        return value ? value : null // 空字符串转为 null
}

export function parseId(id: string, entityMeta: string | EntityMeta) {
    if (_.isString(entityMeta))
        entityMeta = getEntityMeta(entityMeta)
    return parseFieldValue(id, entityMeta.fields._id)
}

export function parseIds(ids: string[], entityMeta: string | EntityMeta) {
    if (!ids) return ids

    if (_.isString(entityMeta))
        entityMeta = getEntityMeta(entityMeta)

    const idMeta = entityMeta.fields._id
    const list = []
    for (const id of ids) {
        const i = parseFieldValue(id, idMeta)
        if (i) list.push(i)
    }
    return list
}

export function formatFieldToHttp(fieldValue: any, fieldMeta: FieldMeta): any {
    if (!fieldValue) return fieldValue

    if (isDateOrTimeType(fieldMeta.type))
        if (fieldMeta.multiple)
            return _.map(fieldValue, dateToLong)
        else
            return dateToLong(fieldValue)
    else if (fieldMeta.type === "Component") {
        if (!fieldMeta.refEntity)
            throw new Error(`No ref entity for field ${fieldMeta.name}`)
        const refEntityMeta = getEntityMeta(fieldMeta.refEntity)
        if (!refEntityMeta)
            throw new Error(`No ref entity [${fieldMeta.refEntity}]. ` +
                `Field ${fieldMeta.name}`)

        if (fieldMeta.multiple)
            return _.map(fieldValue, i =>
                i && formatEntityToHttp(i, refEntityMeta))
        else
            return formatEntityToHttp(fieldValue, refEntityMeta)
    } else if (fieldMeta.type === "Reference")
        return fieldValue // TODO 原样输出即可
    else if (fieldMeta.type === "Password")
        return undefined
    else
        return fieldValue
}

export function formatEntityToHttp(entityValue: EntityValue,
    entityMeta: EntityMeta) {

    const output: EntityValue = {}

    for (const fName in entityMeta.fields) {
        const fieldMeta = entityMeta.fields[fName]
        const o = formatFieldToHttp(entityValue[fName], fieldMeta)
        if (!_.isUndefined(o)) output[fName] = o
    }

    return output
}

export function formatEntitiesToHttp(entityValues: EntityValue[],
    entityMeta: EntityMeta) {
    if (!(entityValues && entityValues.length)) return entityValues
    return _.map(entityValues, e => formatEntityToHttp(e, entityMeta))
}

export function hashPassword(password?: string | null) {
    if (!password) return password
    return crypto.createHash("md5").update(password + password).digest("hex")
}

export function checkPasswordEquals(target: string, notSalted: string) {
    if (extension.checkPasswordEquals) {
        return extension.checkPasswordEquals(target, notSalted)
    } else {
        return hashPassword(notSalted) === target
    }
}

export function getCollectionName(entityMeta: EntityMeta,
    repo?: string | null) {
    const tableName = entityMeta.tableName || entityMeta.name
    if (repo === "trash")
        return tableName + "_trash"
    else
        return tableName
}

export function newObjectId(): mongodb.ObjectId {
    return new mongodb.ObjectId()
}

export function imagePathsToImageObjects(paths: string[],
    thumbnailFilled: boolean) {
    if (!(paths && paths.length)) return paths

    return _.map(paths, path => {
        const o = {path, thumbnail: ""}
        if (thumbnailFilled) o.thumbnail = path
        return o
    })
}


export function patchSystemFields(entityMeta: EntityMeta) {
    const fields: {[k: string]: FieldMeta} = {}

    const dbType = entityMeta.db
    const idType = entityMeta.idType || (dbType === DB.mongo ?
        "ObjectId" : "String")
    const idPersistType = dbType === DB.mongo ? idType === "ObjectId" ?
        "ObjectId" : "String" : "char"
    const intPersistType = dbType === DB.mongo && "Number" || "int"
    const timestampPersistType = dbType === DB.mongo && "Date" || "timestamp"
    const userIdPersistType = dbType === DB.mongo && "String" || "char"

    fields._id = {
        system: true, name: "_id", label: "ID", type: idType,
        required: true,
        persistType: idPersistType, sqlColM: ObjectIdStringLength,
        inputType: "Text", noCreate: true, noEdit: true, fastFilter: true
    }
    fields._version = {
        system: true, name: "_version", label: "修改版本", type: "Int",
        persistType: intPersistType, sqlColM: 12,
        inputType: "Int", noCreate: true, noEdit: true, hideInListPage: true
    }
    fields._createdOn = {
        system: true, name: "_createdOn", label: "创建时间", type: "DateTime",
        persistType: timestampPersistType,
        inputType: "DateTime", noCreate: true, noEdit: true,
        hideInListPage: true
    }
    fields._modifiedOn = {
        system: true, name: "_modifiedOn", label: "修改时间", type: "DateTime",
        persistType: timestampPersistType,
        inputType: "DateTime", noCreate: true, noEdit: true
    }
    fields._createdBy = {
        system: true, name: "_createdBy", label: "创建人", type: "Reference",
        refEntity: "F_User",
        persistType: userIdPersistType, sqlColM: ObjectIdStringLength,
        inputType: "Reference", noCreate: true, noEdit: true,
        hideInListPage: true
    }
    fields._modifiedBy = {
        system: true, name: "_modifiedBy", label: "修改人", type: "Reference",
        refEntity: "F_User",
        persistType: userIdPersistType, sqlColM: ObjectIdStringLength,
        inputType: "Reference", noCreate: true, noEdit: true,
        hideInListPage: true
    }

    return entityMeta.fields = {...entityMeta.fields, ...fields}
}

export function initSystemMeta(extraEntities: EntityMetaMap) {
    if (extraEntities) mergeEntities(extraEntities)

    for (const entityName in SystemEntities) {
        const entityMeta = SystemEntities[entityName]
        if (!entityMeta.noPatchSystemFields) patchSystemFields(entityMeta)
        delete entityMeta.idType
        entityMeta.system = true
    }

    const databases = _.map(Config.mongoDatabases, d => d.name)
    SystemEntities.F_EntityMeta.fields.dbName.options = arrayToOption(databases)

    // TODO mysql databases
}

const SystemEntities: EntityMetaMap = {
    F_EntityMeta: {
        system: true,
        name: "F_EntityMeta", label: "实体元数据", db: DB.none,
        fields: {
            system: {
                name: "system", label: "系统实体", type: "Boolean",
                inputType: "Check", noCreate: true, noEdit: true
            },
            name: {
                name: "name", label: "名称", type: "String",
                inputType: "Text"
            },
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            },
            db: {
                name: "db", label: "数据库类型", type: "String",
                inputType: "Select",
                options: [{name: DB.mongo, label: "MongoDB"},
                    {name: DB.mysql, label: "MySQL"},
                    {name: DB.none, label: "不使用数据库"}]
            },
            dbName: {
                name: "dbName", label: "数据库名", type: "String",
                inputType: "Select"
            },
            tableName: {
                name: "tableName", label: "表名", type: "String",
                inputType: "Text"
            },
            noCreate: {
                name: "noCreate", label: "禁止新增", type: "Boolean",
                inputType: "Check"
            },
            noEdit: {
                name: "noEdit", label: "禁止编辑", type: "Boolean",
                inputType: "Check"
            },
            noDelete: {
                name: "noDelete", label: "禁止删除", type: "Boolean",
                inputType: "Check"
            },
            singleton: {
                name: "singleton", label: "单例", type: "Boolean",
                inputType: "Check"
            },
            digestFields: {
                name: "digestFields", label: "摘要字段", type: "String",
                inputType: "Text"
            },
            mongoIndexes: {
                name: "mongoIndexes", label: "MongoDB索引", type: "Component",
                refEntity: "F_MongoIndex", multiple: true,
                inputType: "PopupComponent"
            },
            mysqlIndexes: {
                name: "mysqlIndexes", label: "MySQL索引", type: "Component",
                refEntity: "F_MySQLIndex", multiple: true,
                inputType: "PopupComponent"
            },
            editEnhanceFunc: {
                name: "editEnhanceFunc", label: "编辑增强脚本", type: "String",
                inputType: "Text", hideInListPage: true
            },
            viewEnhanceFunc: {
                name: "viewEnhanceFunc", label: "详情增强脚本", type: "String",
                inputType: "Text", hideInListPage: true
            },
            fieldGroups: {
                name: "fieldGroups", label: "字段分组", type: "Component",
                refEntity: "F_KeyValue", inputType: "PopupComponent",
                multiple: true
            },
            fields: {
                name: "fields", label: "字段列表",  type: "Component",
                refEntity: "F_FieldMeta", multiple: true,
                inputType: "PopupComponent"
            }
        }
    },
    F_FieldMeta: {
        system: true, noPatchSystemFields: true,
        name: "F_FieldMeta", label: "字段元数据", db: DB.none,
        digestFields: "name,label,type,multiple",
        editEnhanceFunc: "F.enhanceFieldMetaEdit",
        fields: {
            system: {
                name: "system", label: "系统字段", type: "Boolean",
                inputType: "Check",
                noCreate: true, noEdit: true, hideInListPage: true
            },
            name: {
                name: "name", label: "字段名", type: "String",
                inputType: "Text"
            },
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            },
            group: {
                name: "group", label: "分组键", type: "String",
                inputType: "Text"
            },
            comment: {
                name: "comment", label: "开发备注", type: "String",
                inputType: "TextArea", hideInListPage: true
            },
            useGuide: {
                name: "useGuide", label: "使用备注", type: "String",
                inputType: "Text", hideInListPage: true
            },
            type: {
                name: "type", label: "类型", type: "String",
                inputType: "Select",
                options: arrayToOption(FieldDataTypes)
            },
            unique: {
                name: "unique", label: "值唯一", type: "Boolean",
                inputType: "Check", hideInListPage: true
            },
            refEntity: {
                name: "refEntity", label: "关联实体", type: "String",
                inputType: "Text"
            },
            inputType: {
                name: "inputType", label: "输入类型", type: "String",
                inputType: "Select",
                optionsDependOnField: "type",
                optionsFunc: "F.optionsOfInputType",
                hideInListPage: true
            },
            inputFunc: {
                name: "inputFunc", label: "输入构建器", type: "String",
                inputType: "Text", hideInListPage: true
            },
            inputRequired: {
                name: "inputRequired", label: "输入值不能为空", type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            notShow: {
                name: "notShow", label: "界面隐藏", type: "Boolean",
                inputType: "Check", hideInListPage: true
            },
            noCreate: {
                name: "noCreate", label: "不允许创建", type: "Boolean",
                inputType: "Check", hideInListPage: true
            },
            noEdit: {
                name: "noEdit", label: "不允许编辑", type: "Boolean",
                inputType: "Check", hideInListPage: true
            },
            hideInListPage: {
                name: "hideInListPage", label: "列表页面不显示",  type: "Boolean",
                inputType: "Check",  hideInListPage: true
            },
            fastSearch: {
                name: "fastSearch", label: "支持快速搜索", type: "Boolean",
                inputType: "Check"
            },
            persistType: {
                name: "persistType", label: "存储类型", type: "String",
                inputType: "Select", hideInListPage: true,
                optionsDependOnField: "type",
                optionsFunc: "F.optionsOfPersistType"
            },
            sqlColM: {
                name: "sqlColM", label: "SQL列宽", type: "Int",
                inputType: "Int", hideInListPage: true
            },
            required: {
                name: "required", label: "存储非空", type: "Boolean",
                inputType: "Check", hideInListPage: true
            },
            multiple: {
                name: "multiple", label: "多个值", type: "Boolean",
                inputType: "Check"
            },
            multipleUnique: {
                name: "unique", label: "多个值不重复", type: "Boolean",
                inputType: "Check", hideInListPage: true
            },
            multipleMin: {
                name: "multipleMin", label: "多个值数量下限", type: "Int",
                inputType: "Int", hideInListPage: true
            },
            multipleMax: {
                name: "multipleMax", label: "多个值数量上限", type: "Int",
                inputType: "Int", hideInListPage: true
            },
            options: {
                name: "options", label: "输入选项", type: "Component",
                refEntity: "F_FieldInputOption", multiple: true,
                inputType: "InlineComponent", hideInListPage: true
            },
            optionsDependOnField: {
                name: "optionsDependOnField", label: "输入选项随此字段改变",
                type: "String", inputType: "Text", hideInListPage: true
            },
            optionsFunc: {
                name: "optionsFunc", label: "选项决定函数", type: "String",
                inputType: "Text", hideInListPage: true
            },
            groupedOptions: {
                name: "groupedOptions", label: "分组的输入选项",
                type: "Component", refEntity: "F_FieldInputGroupedOptions",
                multiple: true, inputType: "InlineComponent",
                hideInListPage: true
            },
            optionWidth: {
                name: "optionWidth", label: "选项宽度", type: "Int",
                inputType: "Int", hideInListPage: true
            },
            fileStoreDir: {
                name: "fileStoreDir", label: "文件存储路径", type: "String",
                inputType: "Text", hideInListPage: true
            },
            removePreviousFile: {
                name: "removePreviousFile", label: "自动删除之前的文件",
                type: "Boolean", inputType: "Check",
                hideInListPage: true
            },
            fileMaxSize: {
                name: "fileMaxSize", label: "文件大小限制（字节）", type: "Int",
                inputType: "Int", hideInListPage: true
            }
        }
    },
    F_FieldInputOption: {
        system: true, noPatchSystemFields: true,
        name: "F_FieldInputOption", label: "字段输入选项",
        db: DB.none, digestFields: "name,label",
        fields: {
            name: {
                name: "name", label: "字段名", type: "String",
                inputType: "Text"
            },
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            }
        }
    },
    F_FieldInputGroupedOptions: {
        system: true, noPatchSystemFields: true,
        name: "F_FieldInputGroupedOptions", label: "字段输入分组选项",
        db: DB.none, digestFields: "key",
        fields: {
            key: {
                name: "key", label: "分组键", type: "String",
                inputType: "Text"
            },
            options: {
                name: "options", label: "选项列表", type: "Component",
                refEntity: "F_FieldInputOption", multiple: true,
                inputType: "InlineComponent"
            }
        }
    },
    F_MongoIndex: {
        system: true, noPatchSystemFields: true,
        name: "F_MongoIndex", label: "MongoDB索引", db: DB.none,
        digestFields: "name,fields",
        fields: {
            name: {
                name: "name", label: "索引名", type: "String",
                inputType: "Text"
            },
            fields: {
                name: "fields", label: "字段", type: "String",
                inputType: "TextArea", comment: "格式：name:-1,_createdOn:-1"
            },
            unique: {
                name: "unique", label: "unique", type: "Boolean",
                inputType: "Check"
            },
            sparse: {
                name: "sparse", label: "sparse", type: "Boolean",
                inputType: "Check"
            },
            errorMessage: {
                name: "errorMessage", label: "错误消息", type: "String",
                inputType: "Text"
            }
        }
    },
    F_MySQLIndex: {
        system: true, noPatchSystemFields: true,
        name: "F_MySQLIndex", label: "MySQL索引", db: DB.none,
        digestFields: "name,fields",
        fields: {
            name: {
                name: "name", label: "索引名", type: "String",
                inputType: "Text"
            },
            fields: {
                name: "fields", label: "字段", type: "String",
                inputType: "TextArea", comment: "格式：name:-1,_createdOn:-1"
            },
            unique: {
                name: "unique", label: "unique", type: "Boolean",
                inputType: "Check"
            },
            indexType: {
                name: "indexType", label: "indexType", type: "String",
                inputType: "CheckList",
                options: [{name: "BTREE", label: "BTREE"},
                    {name: "HASH", label: "HASH"},
                    {name: "RTREE", label: "RTREE"}]
            },
            errorMessage: {
                name: "errorMessage", label: "错误消息", type: "String",
                inputType: "Text"
            }
        }
    },
    F_SystemConfig: {
        system: true,
        name: "F_SystemConfig", label: "系统配置", db: DB.mongo,
        dbName: "main", tableName: "F_SystemConfig",
        fields: {
            key: {
                name: "key", label: "KEY", type: "String",
                inputType: "Text", persistType: "String"
            },
            mail: {
                name: "systemMail", label: "发信邮箱", type: "String",
                inputType: "Text", persistType: "String"
            },
            mailPassword: {
                name: "mailPassword", label: "发信密码", type: "String",
                inputType: "Text", persistType: "String"
            },
            mailHost: {
                name: "mailHost", label: "发信HOST", type: "String",
                inputType: "Text", persistType: "String"
            },
            mailPort: {
                name: "mailPort", label: "发信PORT", type: "String",
                inputType: "Text", persistType: "String"
            }
        }
    },
    F_Menu: {
        system: true,
        name: "F_Menu", label: "菜单", db: DB.mongo, dbName: "main",
        tableName: "F_Menu",
        fields: {
            menuGroups: {
                name: "menuGroups", label: "菜单组", type: "Component",
                refEntity: "F_MenuGroup", inputType: "InlineComponent",
                multiple: true
            }
        }
    },
    F_MenuGroup: {
        system: true,
        name: "F_MenuGroup", label: "菜单组", db: DB.none,
        fields: {
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            },
            menuItems: {
                name: "menuItems", label: "菜单项", type: "Component",
                refEntity: "F_MenuItem", inputType: "PopupComponent",
                multiple: true
            }
        }
    },
    F_MenuItem: {
        system: true,
        name: "F_MenuItem", label: "菜单项", db: DB.none,
        digestFields: "label,toEntity,callFunc",
        fields: {
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            },
            toEntity: {
                name: "toEntity", label: "到实体", type: "String",
                inputType: "Text"
            },
            callFunc: {
                name: "callFunc", label: "调用函数名", type: "String",
                inputType: "Text"
            }
        }
    },
    F_User: {
        system: true,
        idType: "String", name: "F_User", label: "用户", db: DB.mongo,
        dbName: "main", tableName: "F_User",
        mongoIndexes: [{
            name: "username", fields: "username:1", unique: true, sparse: true,
            errorMessage: "用户名重复"
        }, {
            name: "phone", fields: "phone:1", unique: true, sparse: true,
            errorMessage: "手机已被注册"
        }, {
            name: "email", fields: "email:1", unique: true, sparse: true,
            errorMessage: "邮箱已被注册"
        }, {
            name: "nickname", fields: "nickname:1", unique: true, sparse: true,
            errorMessage: "昵称已被注册"
        }],
        digestFields: "username|nickname|phone|email|_id",
        fields: {
            username: {
                name: "username", label: "用户名", asFastFilter: true,
                type: "String", inputType: "Text", persistType: "String"
            },
            nickname: {
                name: "nickname", label: "昵称", asFastFilter: true,
                type: "String", inputType: "Text", persistType: "String"
            },
            password: {
                name: "password", label: "密码", type: "Password",
                inputType: "Password", persistType: "String"
            },
            phone: {
                name: "phone", label: "手机", asFastFilter: true,
                type: "String", inputType: "Text", persistType: "String"
            },
            email: {
                name: "email", label: "邮箱", asFastFilter: true,
                type: "String",  inputType: "Text", persistType: "String"
            },
            admin: {
                name: "admin", label: "超管", type: "Boolean",
                inputType: "Check",  persistType: "Boolean"
            },
            disabled: {
                name: "disabled",  label: "禁用", type: "Boolean",
                inputType: "Check", persistType: "Boolean"
            },
            roles: {
                name: "roles",  label: "角色",  type: "Reference",
                refEntity: "F_UserRole",  multiple: true,
                inputType: "Reference",  persistType: "String"
            },
            acl: {
                name: "acl", label: "ACL", type: "Object",
                multiple: false, inputFunc: "F.inputACL",
                persistType: "Document", hideInListPage: true
            }
        }
    },
    F_UserRole: {
        system: true, idType: "String",
        name: "F_UserRole", label: "用户角色", db: DB.mongo,
        dbName: "main", tableName: "F_UserRole", digestFields: "name",
        fields: {
            name: {
                name: "name", label: "角色名", type: "String",
                inputType: "Text", asFastFilter: true,
                persistType: "String"
            },
            acl: {
                name: "acl",  label: "ACL",  type: "Object",
                multiple: false, inputFunc: "F.inputACL",
                persistType: "Document", hideInListPage: true
            }
        }
    },
    F_UserSession: {
        system: true,
        name: "F_UserSession", label: "用户Session", db: DB.mongo,
        dbName: "main", tableName: "F_UserSession",
        fields: {
            userId: {
                name: "userId", label: "用户ID", type: "String",
                inputType: "Text", persistType: "String"
            },
            userToken: {
                name: "userToken",  label: "用户TOKEN", type: "String",
                inputType: "Text", persistType: "String"
            },
            origin: {
                name: "origin", label: "origin", type: "String",
                inputType: "Text", persistType: "String"
            },
            expireAt: {
                name: "expireAt", label: "过期时间", type: "Int",
                inputType: "Int", persistType: "Int"
            }
        }
    },
    F_ListFilters: {
        system: true,
        name: "F_ListFilters", label: "列表查询条件", db: DB.mongo,
        dbName: "main", tableName: "F_ListFilters",
        digestFields: "name,entityName",
        fields: {
            name: {
                name: "name", label: "名字", type: "String",
                inputType: "Text", persistType: "String"
            },
            entityName: {
                name: "entityName", label: "实体名", type: "String",
                inputType: "Text", persistType: "String"
            },
            criteria: {
                name: "criteria", label: "条件", type: "String",
                inputType: "TextArea", persistType: "String"
            },
            sortBy: {
                name: "sortBy", label: "排序字段", type: "String",
                inputType: "Text", persistType: "String"
            },
            sortOrder: {
                name: "sortOrder", label: "顺序", type: "String",
                inputType: "Text", persistType: "String"
            }
        }
    },
    F_SsoSession: {
        system: true,
        name: "F_SsoSession", label: "SSoSession", db: DB.mongo,
        dbName: "main", tableName: "F_SsoSession",
        fields: {
            userId: {
                name: "userId",  label: "用户ID",  type: "String",
                inputType: "Text",  persistType: "String"
            },
            userToken: {
                name: "userToken", label: "用户TOKEN", type: "String",
                inputType: "Text",  persistType: "String"
            },
            expireAt: {
                name: "expireAt",  label: "过期时间",   type: "Int",
                inputType: "Int",  persistType: "Int"
            }
        }
    },
    F_SsoClientToken: {
        system: true,  name: "F_SsoClientToken", label: "SSO客户端授权",
        db: DB.mongo, dbName: "main", tableName: "F_SsoClientToken",
        digestFields: "",
        fields: {
            origin: {
                name: "origin",  label: "客户端域", type: "String",
                inputType: "Text",  persistType: "String"
            },
            token: {
                name: "token", label: "授权令牌",  type: "String",
                inputType: "Text",  persistType: "String"
            },
            userId: {
                name: "userId", label: "UserId", type: "String",
                inputType: "Text", persistType: "String"
            }
        }
    },
    F_KeyValue: {
        system: true, name: "F_KeyValue", label: "键值对",
        db: DB.mongo, dbName: "main", tableName: "F_KeyValue",
        digestFields: "key",
        fields: {
            key: {
                name: "key", label: "键", type: "String", inputType: "Text",
                persistType: "String"
            },
            value: {
                name: "value", label: "值", type: "String", inputType: "Text",
                persistType: "String"
            }
        }
    }
}

function arrayToOption(a: string[]): NameLabelOption[] {
    return _.map(a, item => ({name: item, label: item}))
}

function mergeEntities(extraEntities: EntityMetaMap) {
    // Log.debug("extraEntities", extraEntities)
    for (const entityName in extraEntities) {
        const extraEntity = extraEntities[entityName]
        const systemEntity = SystemEntities[entityName]
        if (!systemEntity) {
            SystemEntities[entityName] = extraEntity
            return
        }

        Object.keys(extraEntity).forEach(propName => {
            const propValue = (extraEntity as any)[propName]
            if (propName === "fields") {
                // 对于 fields 属性，合并
                Object.keys(extraEntity.fields).forEach(fieldName => {
                    const extraFieldMeta = extraEntity.fields[fieldName]
                    const systemFieldMeta = systemEntity.fields[fieldName]
                    if (systemFieldMeta) {
                        Object.assign(systemFieldMeta, extraFieldMeta)
                    } else {
                        (systemEntity.fields as any)[fieldName] = extraFieldMeta
                    }
                })
            } else if (propName === "mongoIndexes") {
                // 索引采用追加的方式
                systemEntity.mongoIndexes = systemEntity.mongoIndexes || []
                systemEntity.mongoIndexes.splice(0, 0, ...propValue)
            } else {
                (systemEntity as any)[propName] = propValue
            }
        })

    }
}
