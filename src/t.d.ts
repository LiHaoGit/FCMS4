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
    __type: CriteriaType
    relation: CriteriaRelation
    items: any[],
    field?: string,
    operator?: string,
    value?: any
}

interface MongoCriteria {
    __type: CriteriaType
}

type AnyCriteria = GenericCriteria | MongoCriteria
