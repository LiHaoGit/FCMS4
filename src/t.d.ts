interface FieldMeta {
    name: string
    type: string
    refEntity?: string
    multiple?: boolean
}

interface EntityMeta {
    _version: number
    _modifiedOn: Date
    tableName: string
    fields: {[k:string]: FieldMeta}
}

interface EntityValue {
    [k:string]:any
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
