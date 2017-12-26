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
    noCreate?: boolean
    noDelete?: boolean
    noEdit?: boolean
    history?: number
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
    includedFields?: string[]
    pageSize?: number,
    withoutTotal?: boolean
}

interface ListOption {
    criteria?: GenericCriteria
    sort?: {[k:string]: number}
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
    admin?: boolean
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

interface MongoDBConfig {
    name: string
    url: string
}
interface SSOServerClient {
    acceptTokenUrl: string
    key: string
}

interface SSOServerConfig {
    clients: {[origin: string]: SSOServerClient}
}

interface OriginConfigItem {
    description?: string
    ssoServer: string
    defaultCallbackUrl: string
    ssoKey: string
}

interface OriginConfig {
    [origin: string]: OriginConfigItem
}

interface SubApp {
    label: string
    origins: string[]
}

interface IConfig {
    metaFile: string
    serverPort: number
    serverSocketTimeout: number
    cookieKey: string
    serverPugPath: string
    uploadPath: string
    httpBodyMaxFieldsSize: number
    fileDefaultMaxSize: number
    imageDefaultMaxSize: number
    sessionExpireAtServer: number
    usernameFields: string[]
    mongoDatabases: MongoDBConfig[]
    redis: any
    passwordFormat: RegExp
    fileDir: string
    fileDownloadPrefix: string
    cluster?: boolean
    workerNum?: number
    sso?: string
    subApps?: SubApp[]
    ssoServer: SSOServerConfig
    originConfigs: OriginConfig
    logConfigs: any
    errorCatcher: WebErrorCatcher | null
    preprocess: ()=>void
}
