// cSpell:words icts

import _ = require("lodash")

export type CreateInterceptor = (entityName: string, conn: any,
    instance: EntityValue, operator: any, work: () => any) => any

export type UpdateInterceptor = (entityName: string, conn: any,
    instance: EntityValue, criteria: any, operator: any, work: () => any) => any

export type ListInterceptor = (entityName: string, conn: any, query: ListOption,
    operator: any, work: () => any) => any

export type GetInterceptor = (entityName: string, conn: any, criteria: any,
    operator: any, work: () => any) => any

export type DeleteInterceptor = (entityName: string, conn: any, criteria: any,
    operator: any, work: () => any) => any

export const CreateInterceptors: {[entityName: string]: CreateInterceptor} = {}
export const UpdateInterceptors: {[entityName: string]: UpdateInterceptor} = {}
export const ListInterceptors: {[entityName: string]: ListInterceptor} = {}
export const GetInterceptors: {[entityName: string]: GetInterceptor} = {}
export const DeleteInterceptors: {[entityName: string]: DeleteInterceptor} = {}

export async function aInterceptCreate<T>(entityName: string, conn: any,
    instance: any, operator: EntityValue, work: () => T): Promise<T> {
    const i = CreateInterceptors[entityName]
    if (i) {
        return i(entityName, conn, instance, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptList<T>(entityName: string, conn: any,
    query: ListOption, operator: EntityValue, work: () => T): Promise<T> {
    const i = ListInterceptors[entityName]
    if (i) {
        return i(entityName, conn, query, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptGet<T>(entityName: string, conn: any,
    criteria: any, operator: EntityValue, work: () => T): Promise<T> {
    const i = GetInterceptors[entityName]
    if (i) {
        return i(entityName, conn, criteria, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptDelete<T>(entityName: string, conn: any,
    criteria: any, operator: EntityValue, work: () => T): Promise<T> {
    const i = DeleteInterceptors[entityName]
    if (i) {
        return i(entityName, conn, criteria, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptUpdate<T>(entityName: string, conn: any,
    patch: EntityValue, criteria: any, operator: EntityValue,
    work: () => T): Promise<T> {

    const i = UpdateInterceptors[entityName]
    if (i) {
        return i(entityName, conn, patch, criteria, operator, work)
    } else {
        return work()
    }
}
