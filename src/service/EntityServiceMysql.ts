// cSpell:words repo

export async function aCreate(conn: ExecuteContext, entityMeta: EntityMeta,
    instance: EntityValue) {
    return null
}

export async function aUpdateManyByCriteria(conn: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria, instance: EntityValue) {
    return 0
}

export async function aUpdateOneByCriteria(conn: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria, instance: EntityValue,
    options?: UpdateOption) {
    return 0
}

export async function aRemoveManyByCriteria(conn: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria) {
    return null
}

export async function aRecoverMany(conn: ExecuteContext, entityMeta: EntityMeta,
    ids: any[]) {
    return null
}

export async function aFindOneByCriteria(conn: ExecuteContext,
    entityMeta: EntityMeta, criteria: GenericCriteria, o?: FindOption) {
    return Promise.resolve(null)
}

// sort 为 mongo 原生格式
export async function aList(conn: ExecuteContext, options: ListOption) {
    return null
}

// 从某个历史纪录中恢复
export async function aRestoreHistory(conn: ExecuteContext,
    entityMeta: EntityMeta, id: any, version: number, operatorId: string) {
    return null
}

// 列出历史纪录
export async function aListHistory(conn: ExecuteContext,
    entityMeta: EntityMeta, id: any, pageNo: number, pageSize: number) {
    return {pageNo: 1, pageSize: 10, page: [], total: 0}
}
