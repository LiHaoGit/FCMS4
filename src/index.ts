// cSpell:words repo captcha fcms upsert

export interface KvOption {
    key: string,
    value: string
}

export interface FieldMeta {
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
    fastSearch?: boolean
    optionsFunc?: string
    comment?: string
    inputFunc?: string
    editReadonly?: boolean
    notShow?: boolean
    fileStoreDir?: string
    showInListPage?: boolean
    kvOptions?: KvOption[]
    textOptions?: string[]
}

export interface MongoIndex {
    name: string
    fields: string
    unique?: boolean
    sparse?: boolean
    errorMessage: string
}

export interface EntityMeta {
    system?: boolean
    type?: string
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
    iconField?: string
    digestConfig?: string
    fieldsForDigest?: string[]
    editEnhanceFunc?: string
    noServiceCache?: boolean
    noCreate?: boolean
    noDelete?: boolean
    noEdit?: boolean
    history?: number
    singleton?: boolean
    fields: {[k: string]: FieldMeta}
}

export interface EntityMetaMap {
    [k: string]: EntityMeta
}

export interface EntityValue {
    [k: string]: any
}

export interface GenericCriteria {
    __type?: string
    relation?: string
    items?: any[]
    field?: string
    operator?: string
    value?: any
    [k: string]: any
}

export type MongoCriteria = any

export type AnyCriteria = GenericCriteria | MongoCriteria

export interface ExecuteContext {
    [k: string]: any
}

export interface UpdateOption {
    upsert: boolean
}

export interface FindOption {
    includedFields?: string[]
    pageSize?: number,
    withoutTotal?: boolean
}

export interface ListOption {
    criteria?: GenericCriteria
    sort?: {[k: string]: number}
    includedFields?: string[]
    pageNo?: number
    pageSize?: number
    withoutTotal?: boolean
}

export type WebErrorCatcher = () => void

export interface RouteInfo {
    urlPrefix: string
    errorCatcher?: WebErrorCatcher
    auth?: boolean
    authEntity?: string
    action?: string
    isPage?: boolean
    [k: string]: any
}

export interface RouteConfig {
    admin?: boolean
    auth?: boolean
    authEntity?: string
    action?: string
    isPage?: boolean
}

export interface Extension {
    aSendSecurityCodeToEmail?: (toEmail: string, code: string) => void
    aSendSecurityCodeToPhone?: (toPhone: string, code: string) => void
    aKoaMiddlewareBeforeHandler?: () => void
    checkPasswordEquals?: (target: string, notSalted: string) => boolean
    [k: string]: any
}

export interface CreateResult {
    id: any
}

export type EntityPage = EntityValue[]

export interface PagingListResult {
    pageNo: number
    pageSize: number
    total: number
    page: EntityPage
}

export interface MongoDBConfig {
    name: string
    url: string
}

export interface SSOServerClient {
    acceptTokenUrl: string
    key: string
}

export interface SSOServerConfig {
    clients: {[origin: string]: SSOServerClient}
}

export interface OriginConfigItem {
    description?: string
    ssoServer: string
    defaultCallbackUrl: string
    ssoKey: string
}

export interface OriginConfig {
    [origin: string]: OriginConfigItem
}

export interface SubApp {
    label: string
    origins: string[]
}

export interface IConfig {
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
    tuningFileDir?: string
    preprocess: () => void
}


import {
    aCreate, aFindManyByCriteria, aFindManyByIds, aFindManyIdsByCriteria,
    aFindOneByCriteria, aFindOneById, aGetHistoryItem, aList, aListHistory,
    aRemoveManyByCriteria, aRestoreHistory, aUpdateManyByCriteria,
    aUpdateOneByCriteria, aWithoutTransaction, aWithTransaction
} from "./service/EntityService"

export const Service = {
    aCreate,
    aFindManyByCriteria, aFindManyByIds, aFindManyIdsByCriteria,
    aFindOneByCriteria, aFindOneById, aGetHistoryItem, aList, aListHistory,
    aRemoveManyByCriteria, aRestoreHistory, aUpdateManyByCriteria,
    aUpdateOneByCriteria, aWithoutTransaction, aWithTransaction
}

import {

} from "./handler/EntityHandler"
