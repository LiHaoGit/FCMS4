interface NameLabelOption {
    name: string,
    label: string
}
interface FieldMeta {
    system?: boolean
    name: string
    type: string
    required?: boolean
    refEntity?: string
    multiple?: boolean
    label: string
    persistType?: string
    sqlColM?: number
    inputType?: string
    noCreate?: boolean
    noEdit?: boolean
    fastFilter?: boolean
    hideInListPage?: boolean
    options?: NameLabelOption[]
    optionsDependOnField?: string
    optionsFunc?: string
    comment?: string
    asFastFilter?: boolean
    inputFunc?: string
}

interface MongoIndex {
    name: string
    fields: string
    unique?: boolean
    sparse?: boolean
    errorMessage: string
}

interface EntityMeta {
    system?: boolean
    _version?: number
    name: string
    label: string
    _modifiedOn?: Date
    db: string
    dbName?: string
    idType?: string
    tableName?: string
    noPatchSystemFields?: boolean
    mongoIndexes?: MongoIndex[]
    digestFields?: string
    editEnhanceFunc?: string
    noServiceCache?: boolean
    removeMode?: string
    fields: {[k: string]: FieldMeta}
}

interface EntityMetaMap {[k: string]: EntityMeta}

interface EntityValue {
    [k: string]: any
}

declare enum CriteriaType {
    Relation = "relation",
    Mongo = "mongo"
}

declare enum CriteriaRelation {
    AND = "and",
    OR = "or"
}

interface GenericCriteria {
    __type?: CriteriaType
    relation?: CriteriaRelation
    items?: any[]
    field?: string
    operator?: string
    value?: any
    [k:string]: any
}

type MongoCriteria = any

type AnyCriteria = GenericCriteria | MongoCriteria

interface ExecuteContext {

}

interface UpdateOption {
    upsert: boolean
}

interface FindOption {
    repo?: string
    includedFields?: string[]
    pageSize?: number,
    withoutTotal?: boolean
}

interface ListOption {
    entityMeta: EntityMeta
    criteria?:GenericCriteria
    sort?: {[k:string]: number}
    repo?:string
    includedFields?: string[]
    pageNo?: number
    pageSize?: number
    withoutTotal?: boolean
}
