// cSpell:words repo captcha fcms upsert

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
    editReadonly?: boolean
    notShow?: boolean
    fileStoreDir?: string
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
    noCreate?: boolean
    noDelete?: boolean
    noEdit?: boolean
    fields: {[k: string]: FieldMeta}
}

interface EntityMetaMap {
    [k: string]: EntityMeta
}

interface EntityValue {
    [k: string]: any
}

interface GenericCriteria {
    __type?: string
    relation?: string
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
    criteria?: GenericCriteria
    sort?: {[k:string]: number}
    repo?:string
    includedFields?: string[]
    pageNo?: number
    pageSize?: number
    withoutTotal?: boolean
}

type WebErrorCatcher = ()=>void

interface RouteInfo {
    urlPrefix: string
    errorCatcher?: WebErrorCatcher
    auth?: boolean
    authEntity?: string
    action?: string
    isPage?: boolean
    [k:string]:any
}

interface RouteConfig {
    auth?: boolean
    authEntity?: string
    action?: string
    isPage?: boolean
}

interface Extension {
    aSendSecurityCodeToEmail?: (toEmail: string, code: string) => void
    aSendSecurityCodeToPhone?: (toPhone: string, code: string) => void
    aKoaMiddlewareBeforeHandler?: () => void
    checkPasswordEquals?: (target: string, notSalted: string) => boolean
    [k: string]: any
}

interface CreateResult {
    id: any
}

type EntityPage = EntityValue[]

interface PagingListResult {
    pageNo: number
    pageSize: number
    total: number
    page: EntityPage
}
