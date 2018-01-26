// cSpell:words upsert repo BTREE RTREE

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

    entities[entityName] = entityMeta

    cleanEntities()
    await aWriteJSON(Config.metaFile, entities)
}

export async function aRemoveEntityMeta(entityName: string) {
    delete entities[entityName]

    await aWriteJSON(Config.metaFile, entities)
}

// 假值字段一律移除，包括 false "" null undefined NaN 和空数组，保留 0
function cleanEntities() {
    const entityMetaList = _.values(entities)
    for (const entityMeta of entityMetaList) {
        cleanObject(entityMeta)
        const fieldMetaList = _.values(entityMeta.fields)
        for (const fieldMeta of fieldMetaList) {
            cleanObject(fieldMeta)
        }
    }
}

// 假值字段一律移除，包括 false "" null undefined NaN 和空数组，保留 0
function cleanObject(obj: any) {
    const keys = Object.keys(obj)
    for (const key of keys) {
        const value = obj[key]
        if (value !== 0 && !value
            || _.isArray(value) && value.length === 0) {
            delete obj[key]
        }
    }
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
    if (criteria.relation) {
        if (criteria.items)
            for (const item of criteria.items)
                parseListQueryValue(item, entityMeta)
    } else if (criteria.field) {
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
        inputType: "Text", hideInCreatePage: true, inEditPage: "readonly",
        fastSearch: true
    }
    fields._version = {
        system: true, name: "_version", label: "修改版本", type: "Int",
        persistType: intPersistType, sqlColM: 12,
        inputType: "Int", hideInCreatePage: true, inEditPage: "readonly"
    }
    fields._createdOn = {
        system: true, name: "_createdOn", label: "创建时间", type: "DateTime",
        persistType: timestampPersistType, showInListPage: true,
        inputType: "DateTime", hideInCreatePage: true, inEditPage: "readonly"
    }
    fields._modifiedOn = {
        system: true, name: "_modifiedOn", label: "修改时间", type: "DateTime",
        persistType: timestampPersistType, showInListPage: true,
        inputType: "DateTime", hideInCreatePage: true, inEditPage: "readonly"
    }
    fields._createdBy = {
        system: true, name: "_createdBy", label: "创建人", type: "Reference",
        refEntity: "F_User",
        persistType: userIdPersistType, sqlColM: ObjectIdStringLength,
        inputType: "Reference", hideInCreatePage: true, inEditPage: "readonly"
    }
    fields._modifiedBy = {
        system: true, name: "_modifiedBy", label: "修改人", type: "Reference",
        refEntity: "F_User",
        persistType: userIdPersistType, sqlColM: ObjectIdStringLength,
        inputType: "Reference", hideInCreatePage: true, inEditPage: "readonly"
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
}

const SystemEntities: EntityMetaMap = {
    F_EntityMeta: {
        system: true,
        name: "F_EntityMeta", label: "实体元数据", db: DB.none,
        fields: {
            system: {
                name: "system", label: "系统实体", type: "Boolean",
                inputType: "Check", hideInCreatePage: true,
                inEditPage: "readonly"
            },
            name: {
                name: "name", label: "名称", type: "String",
                inputType: "Text"
            },
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            },
            displayGroup: {
                name: "displayGroup", label: "显示分组名", type: "String",
                inputType: "Text"
            },
            db: {
                name: "db", label: "数据库类型", type: "String",
                inputType: "Select",
                kvOptions: [{key: DB.mongo, value: "MongoDB"},
                    {key: DB.mysql, value: "MySQL"},
                    {key: DB.none, value: "不使用数据库"}]
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
                inputType: "Text"
            },
            viewEnhanceFunc: {
                name: "viewEnhanceFunc", label: "详情增强脚本", type: "String",
                inputType: "Text"
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
        editEnhanceFunc: "F.enhanceFieldMetaEdit",
        fields: {
            system: {
                name: "system", label: "系统字段", type: "Boolean",
                inputType: "Check",
                hideInCreatePage: true, inEditPage: "readonly"
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
                inputType: "TextArea"
            },
            useGuide: {
                name: "useGuide", label: "使用备注", type: "String",
                inputType: "Text"
            },
            type: {
                name: "type", label: "类型", type: "String",
                inputType: "Select",
                textOptions: FieldDataTypes
            },
            unique: {
                name: "unique", label: "值唯一", type: "Boolean",
                inputType: "Check"
            },
            refEntity: {
                name: "refEntity", label: "关联实体", type: "String",
                inputType: "Text"
            },
            inputType: {
                name: "inputType", label: "输入类型", type: "String",
                inputType: "Select"
            },
            inputFunc: {
                name: "inputFunc", label: "输入构建器", type: "String",
                inputType: "Text"
            },
            inputRequired: {
                name: "inputRequired", label: "输入值不能为空", type: "Boolean",
                inputType: "Check"
            },
            notShow: {
                name: "notShow", label: "界面隐藏", type: "Boolean",
                inputType: "Check"
            },
            noCreate: {
                name: "noCreate", label: "不允许创建", type: "Boolean",
                inputType: "Check"
            },
            noEdit: {
                name: "noEdit", label: "不允许编辑", type: "Boolean",
                inputType: "Check"
            },
            fastSearch: {
                name: "fastSearch", label: "支持快速搜索", type: "Boolean",
                inputType: "Check"
            },
            persistType: {
                name: "persistType", label: "存储类型", type: "String",
                inputType: "Select"
            },
            sqlColM: {
                name: "sqlColM", label: "SQL列宽", type: "Int",
                inputType: "Int"
            },
            required: {
                name: "required", label: "存储非空", type: "Boolean",
                inputType: "Check"
            },
            multiple: {
                name: "multiple", label: "多个值", type: "Boolean",
                inputType: "Check"
            },
            multipleUnique: {
                name: "unique", label: "多个值不重复", type: "Boolean",
                inputType: "Check"
            },
            multipleMin: {
                name: "multipleMin", label: "多个值数量下限", type: "Int",
                inputType: "Int"
            },
            multipleMax: {
                name: "multipleMax", label: "多个值数量上限", type: "Int",
                inputType: "Int"
            },
            options: {
                name: "options", label: "输入选项", type: "Component",
                refEntity: "F_FieldInputOption", multiple: true,
                inputType: "InlineComponent"
            },
            optionsDependOnField: {
                name: "optionsDependOnField", label: "输入选项随此字段改变",
                type: "String", inputType: "Text"
            },
            optionsFunc: {
                name: "optionsFunc", label: "选项决定函数", type: "String",
                inputType: "Text"
            },
            groupedOptions: {
                name: "groupedOptions", label: "分组的输入选项",
                type: "Component", refEntity: "F_FieldInputGroupedOptions",
                multiple: true, inputType: "InlineComponent"
            },
            optionWidth: {
                name: "optionWidth", label: "选项宽度", type: "Int",
                inputType: "Int"
            },
            fileStoreDir: {
                name: "fileStoreDir", label: "文件存储路径", type: "String",
                inputType: "Text"
            },
            removePreviousFile: {
                name: "removePreviousFile", label: "自动删除之前的文件",
                type: "Boolean", inputType: "Check"
            },
            fileMaxSize: {
                name: "fileMaxSize", label: "文件大小限制（字节）", type: "Int",
                inputType: "Int"
            }
        }
    },
    F_FieldInputOption: {
        system: true, noPatchSystemFields: true,
        name: "F_FieldInputOption", label: "字段输入选项",
        db: DB.none,
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
        db: DB.none,
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
                textOptions: ["BTREE", "HASH", "RTREE"]
            },
            errorMessage: {
                name: "errorMessage", label: "错误消息", type: "String",
                inputType: "Text"
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
        system: true, type: "Component",
        name: "F_MenuGroup", label: "菜单组", db: DB.none,
        digestConfig: "label",
        fieldsForDigest: ["label"],
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
        system: true, type: "Component",
        name: "F_MenuItem", label: "菜单项", db: DB.none,
        digestConfig: "label&toEntity&callFunc",
        fieldsForDigest: ["label", "toEntity", "callFunc"],
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
    F_SystemConfig: {
        system: true, type: "Entity",
        name: "F_SystemConfig", label: "系统配置", db: DB.mongo,
        singleton: true,
        fields: {
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            }
        }
    },
    F_User: {
        system: true,
        idType: "String", name: "F_User", label: "用户", db: DB.mongo,
        dbName: "main", tableName: "F_User",
        mongoIndexes: [{
            name: "username",
            fields: [{field: "username", order: "+"}],
            unique: true, sparse: true,
            errorMessage: "用户名重复"
        }, {
            name: "phone",
            fields: [{field: "phone", order: "+"}],
            unique: true, sparse: true,
            errorMessage: "手机已被注册"
        }, {
            name: "email",
            fields: [{field: "email", order: "+"}],
            unique: true, sparse: true,
            errorMessage: "邮箱已被注册"
        }, {
            name: "nickname",
            fields: [{field: "nickname", order: "+"}],
            unique: true, sparse: true,
            errorMessage: "昵称已被注册"
        }],
        digestConfig: "username|nickname|phone|email",
        fieldsForDigest: ["username", "nickname", "phone", "email"],
        fields: {
            username: {
                name: "username", label: "用户名", fastSearch: true,
                type: "String", inputType: "Text", persistType: "String",
                showInListPage: true
            },
            nickname: {
                name: "nickname", label: "昵称", fastSearch: true,
                type: "String", inputType: "Text", persistType: "String",
                showInListPage: true
            },
            password: {
                name: "password", label: "密码", type: "Password",
                inputType: "Password", persistType: "String"
            },
            phone: {
                name: "phone", label: "手机", fastSearch: true,
                type: "String", inputType: "Text", persistType: "String",
                showInListPage: true
            },
            email: {
                name: "email", label: "邮箱", fastSearch: true,
                type: "String",  inputType: "Text", persistType: "String",
                showInListPage: true
            },
            admin: {
                name: "admin", label: "超管", type: "Boolean",
                inputType: "Check",  persistType: "Boolean",
                showInListPage: true
            },
            disabled: {
                name: "disabled",  label: "禁用", type: "Boolean",
                inputType: "Check", persistType: "Boolean",
                showInListPage: true
            },
            roles: {
                name: "roles",  label: "角色",  type: "Reference",
                refEntity: "F_UserRole",  multiple: true,
                inputType: "Reference",  persistType: "String"
            },
            acl: {
                name: "acl", label: "ACL", type: "Object",
                multiple: false, inputType: "JSON",
                persistType: "Document"
            }
        }
    },
    F_UserRole: {
        system: true, idType: "String",
        name: "F_UserRole", label: "用户角色", db: DB.mongo,
        dbName: "main", tableName: "F_UserRole",
        digestConfig: "name", fieldsForDigest: ["name"],
        fields: {
            name: {
                name: "name", label: "角色名", type: "String",
                inputType: "Text", fastSearch: true,
                persistType: "String", showInListPage: true
            },
            acl: {
                name: "acl",  label: "ACL",  type: "Object",
                multiple: false, inputType: "JSON",
                persistType: "Document"
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
                inputType: "Text", persistType: "String", showInListPage: true
            },
            userToken: {
                name: "userToken",  label: "用户TOKEN", type: "Password",
                inputType: "Password", persistType: "String"
            },
            origin: {
                name: "origin", label: "origin", type: "String",
                inputType: "Text", persistType: "String", showInListPage: true
            },
            expireAt: {
                name: "expireAt", label: "过期时间", type: "Int",
                inputType: "Int", persistType: "Int", showInListPage: true
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
                inputType: "Text",  persistType: "String", showInListPage: true
            },
            userToken: {
                name: "userToken", label: "用户TOKEN", type: "Password",
                inputType: "Password",  persistType: "String"
            },
            expireAt: {
                name: "expireAt",  label: "过期时间",   type: "Int",
                inputType: "Int",  persistType: "Int", showInListPage: true
            }
        }
    },
    F_SsoClientToken: {
        system: true,  name: "F_SsoClientToken", label: "SSO客户端授权",
        db: DB.mongo, dbName: "main", tableName: "F_SsoClientToken",
        fields: {
            origin: {
                name: "origin",  label: "客户端域", type: "String",
                inputType: "Text",  persistType: "String", showInListPage: true
            },
            token: {
                name: "token", label: "授权令牌",  type: "Password",
                inputType: "Password",  persistType: "String"
            },
            userId: {
                name: "userId", label: "UserId", type: "String",
                inputType: "Text", persistType: "String", showInListPage: true
            }
        }
    },
    F_ListFilters: {
        system: true,
        name: "F_ListFilters", label: "列表查询条件", db: DB.mongo,
        dbName: "main", tableName: "F_ListFilters",
        digestConfig: "name&entityName",
        fieldsForDigest: ["name", "entityName"],
        fields: {
            name: {
                name: "name", label: "名字", type: "String",
                inputType: "Text", persistType: "String", showInListPage: true
            },
            entityName: {
                name: "entityName", label: "实体名", type: "String",
                inputType: "Text", persistType: "String", showInListPage: true
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
    F_KeyValue: {
        system: true, type: "Component", name: "F_KeyValue", label: "键值对",
        db: DB.mongo, dbName: "main", tableName: "F_KeyValue",
        digestConfig: "key", fieldsForDigest: ["key"],
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
