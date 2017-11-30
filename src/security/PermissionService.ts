// 菜单权限、按钮权限、端点权限、实体权限（增删改查）、字段权限（读、填、改）

import { arrayToTrueObject, stringToBoolean } from "../Util"

export interface AccessControlArray {
    menu?: string[]
    button?: string[]
    action?: string[]
    entity?: {[entityName: string]: string[]}
    field?: {[entityName: string]: {[fieldName: string]: string[]}}
}

export interface StringToBooleanMap {
    [k: string]: boolean
}

export interface StringToBooleanMap2 {
    [k: string]: StringToBooleanMap | undefined
}

export interface AccessControlList {
    menu?: StringToBooleanMap
    button?: StringToBooleanMap
    action?: StringToBooleanMap
    entity?: StringToBooleanMap2
    field?: {[entityName: string]: StringToBooleanMap2 | undefined}
}

export function permissionArrayToMap(aca: AccessControlArray)
    : AccessControlList | null {
    if (!aca) return null

    const acl: AccessControlList = {}
    acl.menu = arrayToTrueObject(aca.menu) || undefined
    acl.button = arrayToTrueObject(aca.button) || undefined
    acl.action = arrayToTrueObject(aca.action) || undefined

    if (aca.entity) {
        const entity: {[k: string]: StringToBooleanMap | undefined} = {}
        const entities = aca.entity
        Object.keys(entities).forEach(entityName => {
            const v = entities[entityName]
            entity[entityName] = arrayToTrueObject(v) || undefined
        })
        acl.entity = entity
    }
    if (aca.field) {
        const field: {[k: string]: StringToBooleanMap2 | undefined} = {}
        const entities = aca.field
        Object.keys(entities).forEach(entityName => {
            const e = entities[entityName]
            const e2: StringToBooleanMap2 = {}
            Object.keys(e).forEach(fieldName => {
                const f = e[fieldName]
                if (f) e2[fieldName] = arrayToTrueObject(f) || undefined
            })
            field[entityName] = e2
        })
    }

    return acl
}
