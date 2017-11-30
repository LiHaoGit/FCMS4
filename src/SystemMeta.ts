import * as _ from "lodash"

import Config from "./Config"
import { DB, FieldDataTypes, ObjectIdStringLength } from "./Meta"

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

function arrayToOption(a: string[]): NameLabelOption[] {
    return _.map(a, item => ({name: item, label: item}))
}

export const SystemEntities: EntityMetaMap = {
    F_EntityMeta: {
        system: true,
        name: "F_EntityMeta",
        label: "实体元数据",
        db: DB.none,
        fields: {
            system: {
                name: "system",
                label: "系统实体",
                type: "Boolean",
                inputType: "Check",
                noCreate: true,
                noEdit: true
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
                name: "db",
                label: "数据库类型",
                type: "String",
                inputType: "Select",
                options: [{name: DB.mongo, label: "MongoDB"},
                    {name: DB.mysql, label: "MySQL"},
                    {name: DB.none, label: "不使用数据库"}]
            },
            dbName: {
                name: "dbName",
                label: "数据库名",
                type: "String",
                inputType: "Select"
            },
            tableName: {
                name: "tableName",
                label: "表名",
                type: "String",
                inputType: "Text"
            },
            noCreate: {
                name: "noCreate",
                label:
                "禁止新增",
                type: "Boolean",
                inputType: "Check"
            },
            noEdit: {
                name: "noEdit",
                label:
                "禁止编辑",
                type: "Boolean",
                inputType: "Check"
            },
            noDelete: {
                name: "noDelete",
                label:
                "禁止删除",
                type: "Boolean",
                inputType: "Check"
            },
            singleton: {
                name: "singleton",
                label:
                "单例",
                type: "Boolean",
                inputType: "Check"
            },
            digestFields: {
                name: "digestFields",
                label:
                "摘要字段",
                type: "String",
                inputType: "Text"
            },
            mongoIndexes: {
                name: "mongoIndexes",
                label: "MongoDB索引",
                type: "Component",
                refEntity: "F_MongoIndex",
                multiple: true,
                inputType: "PopupComponent"
            },
            mysqlIndexes: {
                name: "mysqlIndexes",
                label: "MySQL索引",
                type: "Component",
                refEntity: "F_MySQLIndex",
                multiple: true,
                inputType: "PopupComponent"
            },
            editEnhanceFunc: {
                name: "editEnhanceFunc",
                label: "编辑增强脚本",
                type: "String",
                inputType: "Text",
                hideInListPage: true
            },
            viewEnhanceFunc: {
                name: "viewEnhanceFunc",
                label: "详情增强脚本",
                type: "String",
                inputType: "Text",
                hideInListPage: true
            },
            fieldGroups: {
                name: "fieldGroups", label: "字段分组", type: "Component",
                refEntity: "F_KeyValue", inputType: "PopupComponent",
                multiple: true
            },
            fields: {
                name: "fields",
                label: "字段列表",
                type: "Component",
                refEntity: "F_FieldMeta",
                multiple: true,
                inputType: "PopupComponent"
            }
        }
    },
    F_FieldMeta: {
        system: true,
        noPatchSystemFields: true,
        name: "F_FieldMeta",
        label: "字段元数据",
        db: DB.none,
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
                name: "inputRequired",
                label: "输入值不能为空",
                type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            notShow: {
                name: "notShow",
                label: "界面隐藏",
                type:
                "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            noCreate: {
                name: "noCreate",
                label: "不允许创建",
                type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            noEdit: {
                name: "noEdit",
                label: "不允许编辑",
                type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            hideInListPage: {
                name: "hideInListPage",
                label: "列表页面不显示",
                type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            fastSearch: {
                name: "fastSearch",
                label: "支持快速搜索",
                type: "Boolean",
                inputType: "Check"
            },
            persistType: {
                name: "persistType",
                label: "存储类型",
                type: "String",
                inputType: "Select",
                optionsDependOnField: "type",
                optionsFunc: "F.optionsOfPersistType",
                hideInListPage: true
            },
            sqlColM: {
                name: "sqlColM",
                label: "SQL列宽",
                type: "Int",
                inputType: "Int",
                hideInListPage: true
            },
            required: {
                name: "required",
                label: "存储非空",
                type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            multiple: {
                name: "multiple",
                label: "多个值",
                type: "Boolean",
                inputType: "Check"
            },
            multipleUnique: {
                name: "unique",
                label: "多个值不重复",
                type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            multipleMin: {
                name: "multipleMin",
                label: "多个值数量下限",
                type: "Int",
                inputType: "Int",
                hideInListPage: true
            },
            multipleMax: {
                name: "multipleMax",
                label: "多个值数量上限",
                type: "Int",
                inputType: "Int",
                hideInListPage: true
            },
            options: {
                name: "options",
                label: "输入选项",
                type: "Component",
                refEntity: "F_FieldInputOption",
                multiple: true,
                inputType: "InlineComponent",
                hideInListPage: true
            },
            optionsDependOnField: {
                name: "optionsDependOnField",
                label: "输入选项随此字段改变",
                type: "String",
                inputType: "Text",
                hideInListPage: true
            },
            optionsFunc: {
                name: "optionsFunc",
                label: "选项决定函数",
                type: "String",
                inputType: "Text",
                hideInListPage: true
            },
            groupedOptions: {
                name: "groupedOptions",
                label: "分组的输入选项",
                type: "Component",
                refEntity: "F_FieldInputGroupedOptions",
                multiple: true,
                inputType: "InlineComponent",
                hideInListPage: true
            },
            optionWidth: {
                name: "optionWidth",
                label: "选项宽度",
                type: "Int",
                inputType: "Int",
                hideInListPage: true
            },
            fileStoreDir: {
                name: "fileStoreDir",
                label: "文件存储路径",
                type: "String",
                inputType: "Text",
                hideInListPage: true
            },
            removePreviousFile: {
                name: "removePreviousFile",
                label: "自动删除之前的文件",
                type: "Boolean",
                inputType: "Check",
                hideInListPage: true
            },
            fileMaxSize: {
                name: "fileMaxSize",
                label: "文件大小限制（字节）",
                type: "Int",
                inputType: "Int",
                hideInListPage: true
            }
        }
    },
    F_FieldInputOption: {
        system: true,
        noPatchSystemFields: true,
        name: "F_FieldInputOption",
        label: "字段输入选项",
        db: DB.none,
        digestFields: "name,label",
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
        system: true,
        noPatchSystemFields: true,
        name: "F_FieldInputGroupedOptions",
        label: "字段输入分组选项",
        db: DB.none,
        digestFields: "key",
        fields: {
            key: {
                name: "key", label: "分组键", type: "String",
                inputType: "Text"
            },
            options: {
                name: "options",
                label: "选项列表",
                type: "Component",
                refEntity: "F_FieldInputOption",
                multiple: true,
                inputType: "InlineComponent"
            }
        }
    },
    F_MongoIndex: {
        system: true,
        noPatchSystemFields: true,
        name: "F_MongoIndex",
        label: "MongoDB索引",
        db: DB.none,
        digestFields: "name,fields",
        fields: {
            name: {
                name: "name", label: "索引名", type: "String",
                inputType: "Text"
            },
            fields: {
                name: "fields",
                label: "字段",
                type: "String",
                inputType: "TextArea",
                comment: "格式：name:-1,_createdOn:-1"
            },
            unique: {
                name: "unique",
                label: "unique",
                type: "Boolean",
                inputType: "Check"
            },
            sparse: {
                name: "sparse",
                label: "sparse",
                type: "Boolean",
                inputType: "Check"
            },
            errorMessage: {
                name: "errorMessage",
                label: "错误消息",
                type: "String",
                inputType: "Text"
            }
        }
    },
    F_MySQLIndex: {
        system: true,
        noPatchSystemFields: true,
        name: "F_MySQLIndex",
        label: "MySQL索引",
        db: DB.none,
        digestFields: "name,fields",
        fields: {
            name: {
                name: "name", label: "索引名", type: "String",
                inputType: "Text"
            },
            fields: {
                name: "fields",
                label: "字段",
                type: "String",
                inputType: "TextArea",
                comment: "格式：name:-1,_createdOn:-1"
            },
            unique: {
                name: "unique",
                label: "unique",
                type: "Boolean",
                inputType: "Check"
            },
            indexType: {
                name: "indexType",
                label: "indexType",
                type: "String",
                inputType: "CheckList",
                options:
                [{name: "BTREE", label: "BTREE"},
                    {name: "HASH", label: "HASH"},
                    {name: "RTREE", label: "RTREE"}]
            },
            errorMessage: {
                name: "errorMessage",
                label: "错误消息",
                type: "String",
                inputType: "Text"
            }
        }
    },
    F_SystemConfig: {
        system: true,
        name: "F_SystemConfig",
        label: "系统配置",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_SystemConfig",
        fields: {
            key: {
                name: "key",
                label: "KEY",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            mail: {
                name: "systemMail",
                label: "发信邮箱",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            mailPassword: {
                name: "mailPassword",
                label: "发信密码",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            mailHost: {
                name: "mailHost",
                label: "发信HOST",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            mailPort: {
                name: "mailPort",
                label: "发信PORT",
                type: "String",
                inputType: "Text",
                persistType: "String"
            }
        }
    },
    F_Menu: {
        system: true,
        name: "F_Menu",
        label: "菜单",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_Menu",
        fields: {
            menuGroups: {
                name: "menuGroups",
                label: "菜单组",
                type: "Component",
                refEntity: "F_MenuGroup",
                inputType: "InlineComponent",
                multiple: true
            }
        }
    },
    F_MenuGroup: {
        system: true,
        name: "F_MenuGroup",
        label: "菜单组",
        db: DB.none,
        fields: {
            label: {
                name: "label", label: "显示名", type: "String",
                inputType: "Text"
            },
            menuItems: {
                name: "menuItems",
                label: "菜单项",
                type: "Component",
                refEntity: "F_MenuItem",
                inputType: "PopupComponent",
                multiple: true
            }
        }
    },
    F_MenuItem: {
        system: true,
        name: "F_MenuItem",
        label: "菜单项",
        db: DB.none,
        digestFields: "label,toEntity,callFunc",
        fields: {
            label: {
                name: "label",
                label: "显示名",
                type: "String",
                inputType: "Text"
            },
            toEntity: {
                name: "toEntity",
                label: "到实体",
                type: "String",
                inputType: "Text"
            },
            callFunc: {
                name: "callFunc",
                label: "调用函数名",
                type: "String",
                inputType: "Text"
            }
        }
    },
    F_User: {
        system: true,
        idType: "String",
        name: "F_User",
        label: "用户",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_User",
        mongoIndexes: [{
            name: "username",
            fields: "username:1",
            unique: true,
            sparse: true,
            errorMessage: "用户名重复"
        },
        {
            name: "phone",
            fields: "phone:1",
            unique: true,
            sparse: true,
            errorMessage: "手机已被注册"
        },
        {
            name: "email",
            fields: "email:1",
            unique: true,
            sparse: true,
            errorMessage: "邮箱已被注册"
        },
        {
            name: "nickname",
            fields: "nickname:1",
            unique: true,
            sparse: true,
            errorMessage: "昵称已被注册"
        }],
        digestFields: "username|nickname|phone|email|_id",
        fields: {
            username: {
                name: "username",
                label: "用户名",
                asFastFilter: true,
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            nickname: {
                name: "nickname",
                label: "昵称",
                asFastFilter: true,
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            password: {
                name: "password",
                label: "密码",
                type: "Password",
                inputType: "Password",
                persistType: "String"
            },
            phone: {
                name: "phone",
                label: "手机",
                asFastFilter: true,
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            email: {
                name: "email",
                label: "邮箱",
                asFastFilter: true,
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            admin: {
                name: "admin",
                label: "超管",
                type: "Boolean",
                inputType: "Check",
                persistType: "Boolean"
            },
            disabled: {
                name: "disabled",
                label: "禁用",
                type: "Boolean",
                inputType: "Check",
                persistType: "Boolean"
            },
            roles: {
                name: "roles",
                label: "角色",
                type: "Reference",
                refEntity: "F_UserRole",
                multiple: true,
                inputType: "Reference",
                persistType: "String"
            },
            acl: {
                name: "acl",
                label: "ACL",
                type: "Object",
                multiple: false,
                inputFunc: "F.inputACL",
                persistType: "Document",
                hideInListPage: true
            }
        }
    },
    F_UserRole: {
        system: true,
        idType: "String",
        name: "F_UserRole",
        label: "用户角色",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_UserRole",
        digestFields: "name",
        fields: {
            name: {
                name: "name",
                label: "角色名",
                type: "String",
                inputType: "Text",
                asFastFilter: true,
                persistType: "String"
            },
            acl: {
                name: "acl",
                label: "ACL",
                type: "Object",
                multiple: false,
                inputFunc: "F.inputACL",
                persistType: "Document",
                hideInListPage: true
            }
        }
    },
    F_UserSession: {
        system: true,
        name: "F_UserSession",
        label: "用户Session",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_UserSession",
        fields: {
            userId: {
                name: "userId",
                label: "用户ID",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            userToken: {
                name: "userToken",
                label: "用户TOKEN",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            origin: {
                name: "origin",
                label: "origin",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            expireAt: {
                name: "expireAt",
                label: "过期时间",
                type: "Int",
                inputType: "Int",
                persistType: "Int"
            }
        }
    },
    F_ListFilters: {
        system: true,
        name: "F_ListFilters",
        label: "列表查询条件",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_ListFilters",
        digestFields: "name,entityName",
        fields: {
            name: {
                name: "name",
                label: "名字",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            entityName: {
                name: "entityName",
                label: "实体名",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            criteria: {
                name: "criteria",
                label: "条件",
                type: "String",
                inputType: "TextArea",
                persistType: "String"
            },
            sortBy: {
                name: "sortBy",
                label: "排序字段",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            sortOrder: {
                name: "sortOrder",
                label: "顺序",
                type: "String",
                inputType: "Text",
                persistType: "String"
            }
        }
    },
    F_SsoSession: {
        system: true,
        name: "F_SsoSession",
        label: "SSoSession",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_SsoSession",
        fields: {
            userId: {
                name: "userId",
                label: "用户ID",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            userToken: {
                name: "userToken",
                label: "用户TOKEN",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            expireAt: {
                name: "expireAt",
                label: "过期时间",
                type: "Int",
                inputType: "Int",
                persistType: "Int"
            }
        }
    },
    F_SsoClientToken: {
        system: true,
        name: "F_SsoClientToken",
        label: "SSO客户端授权",
        db: DB.mongo,
        dbName: "main",
        tableName: "F_SsoClientToken",
        digestFields: "",
        fields: {
            origin: {
                name: "origin",
                label: "客户端域",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            token: {
                name: "token",
                label: "授权令牌",
                type: "String",
                inputType: "Text",
                persistType: "String"
            },
            userId: {
                name: "userId",
                label: "UserId",
                type: "String",
                inputType: "Text",
                persistType: "String"
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
