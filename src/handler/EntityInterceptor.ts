// cSpell:words icts

import _ = require("lodash")

type CreateInterceptor = (entityName: string, conn: any, instance: EntityValue,
    operator: any, work: () => any) => any

type UpdateInterceptor = (entityName: string, conn: any, instance: EntityValue,
    criteria: any, operator: any, work: () => any) => any

type ListInterceptor = (entityName: string, conn: any, query: ListOption,
    operator: any, work: () => any) => any

type GetInterceptor = (entityName: string, conn: any, criteria: any,
    operator: any, work: () => any) => any

type DeleteInterceptor = (entityName: string, conn: any, criteria: any,
    operator: any, work: () => any) => any

const interceptorsOfCreate: {[entityName: string]: CreateInterceptor} = {}
const interceptorsOfUpdate: {[entityName: string]: UpdateInterceptor} = {}
const interceptorsOfList: {[entityName: string]: ListInterceptor} = {}
const interceptorsOfGet: {[entityName: string]: GetInterceptor} = {}
const interceptorsOfDelete: {[entityName: string]: DeleteInterceptor} = {}

export async function aInterceptCreate<T>(entityName: string, conn: any,
    instance: any, operator: EntityValue, work: () => T): Promise<T> {
    const i = interceptorsOfCreate[entityName]
    if (i) {
        return i(entityName, conn, instance, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptList<T>(entityName: string, conn: any,
    query: ListOption, operator: EntityValue, work: () => T): Promise<T> {
    const i = interceptorsOfList[entityName]
    if (i) {
        return i(entityName, conn, query, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptGet<T>(entityName: string, conn: any,
    criteria: any, operator: EntityValue, work: () => T): Promise<T> {
    const i = interceptorsOfGet[entityName]
    if (i) {
        return i(entityName, conn, criteria, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptDelete<T>(entityName: string, conn: any,
    criteria: any, operator: EntityValue, work: () => T): Promise<T> {
    const i = interceptorsOfDelete[entityName]
    if (i) {
        return i(entityName, conn, criteria, operator, work)
    } else {
        return work()
    }
}

export async function aInterceptUpdate<T>(entityName: string, conn: any,
    patch: EntityValue, criteria: any, operator: EntityValue,
    work: () => T): Promise<T> {

    const i = interceptorsOfUpdate[entityName]
    if (i) {
        return i(entityName, conn, patch, criteria, operator, work)
    } else {
        return work()
    }
}
