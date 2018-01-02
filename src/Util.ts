import { ObjectID } from "bson"
import * as koa from "koa"
import _ = require("lodash")
import mongodb = require("mongodb")
import URL = require("url")

const ObjectId = mongodb.ObjectID

export function jsObjectToTypedJSON(jsObject: any | null): any | null {
    if (!jsObject) return null

    if (_.isDate(jsObject)) {
        return {_type: "Date", _value: jsObject.getTime()}
    } else if (jsObject instanceof ObjectId) {
        return {_type: "ObjectId", _value: jsObject.toString()}
    } else if (_.isArray(jsObject)) {
        const jsonArray = []
        for (const value of jsObject)
            jsonArray.push(jsObjectToTypedJSON(value))
        return {_type: "array", _value: jsonArray}
    } else if (_.isObject(jsObject)) {
        const jsonObject: {[k: string]: any} = {}
        Object.keys(jsObject).forEach(k => {
            jsonObject[k] = jsObjectToTypedJSON(jsObject[k])
        })
        return {_type: "object", _value: jsonObject}
    } else {
        return {_type: "", _value: jsObject}
    }
}

export function typedJSONToJsObject(typedObject: any): any | null {
    if (!typedObject) return null
    const value = typedObject._value
    const type = typedObject._type
    if (type === "array") {
        const array = []
        for (const item of value) {
            array.push(typedJSONToJsObject(item))
        }
        return array
    } else if (type === "object") {
        const jsObject: {[k: string]: any} = {}
        Object.keys(value).forEach(key =>
            jsObject[key] = typedJSONToJsObject(value[key]))
        return jsObject
    } else if (type === "Date") {
        return new Date(value)
    } else if (type === "ObjectId") {
        return new ObjectId(value)
    } else {
        return value
    }
}

export function stringToInt(s: string, alternative?: number) {
    const num = _.toInteger(s)
    if (num || num === 0) return num
    return alternative
}

export function stringToFloat(s: string, alternative?: number) {
    "use strict"
    const num = _.toNumber(s)
    if (num || num === 0) return num
    return alternative
}

export function trimString(s?: string | null) {
    if (!s) return s
    return s.replace(/(^\s*)|(\s*$)/g, "")
}

export function longToDate(long: number) {
    if (!long) return long
    if (_.isDate(long)) return long
    return new Date(long)
}

export function dateToLong(date?: Date | null) {
    if (!date) return date
    return date.getTime()
}

/**
 * 字符串 "false" 转换为 false，"true" 转换为 true，null 原样返回，其余返回 undefined
 */
export function stringToBoolean(value: string) {
    if (_.isBoolean(value))
        return value
    else if (value === "false")
        return false
    else if (value === "true")
        return true
    else if (_.isNull(value))
        return null
    else
        return undefined
}

export function arrayToTrueObject(array?: string[]) {
    return arrayToBooleanObject(true, array)
}

export function arrayToBooleanObject(boolValue: boolean, array?: string[]) {
    if (!array) return null

    const o: {[s: string]: boolean} = {}
    for (const a of array) o[a] = boolValue
    return o
}

export function objectToKeyValuePairString(obj: {[k: string]: any}) {
    const a = _.map(obj, (k, v) => `${k}=${v}`)
    return obj && _.join(a, "&") || ""
}

export function inObjectIds(targetId: string, ids: mongodb.ObjectID[]) {
    for (const id of ids)
        if (id && id.toString() === targetId) return true

    return false
}

export function getSingedPortedCookies(ctx: koa.Context, ...names: string[]) {
    const port = getPortOfUrl(ctx.request.origin)
    // console.log("port", port)
    return _.map(names, n => ctx.cookies.get(`${n}-${port}`, {signed: true}))
}

export function setSingedPortedCookies(ctx: koa.Context,
    pairs: {[k: string]: any}) {
    const port = getPortOfUrl(ctx.request.origin)
    for (const name in pairs) {
        ctx.cookies.set(`${name}-${port}`, pairs[name], {signed: true})
    }
}

export function getMyRequestHeaders(ctx: koa.Context, ...names: string[]) {
    return _.map(names, n => ctx.headers[`X-FCMS-${n}`.toLowerCase()])
}

export function setIfNone<T>(object: any, field: string, alt: T): T {
    const v = object[field]
    if (!_.isNil(v)) return v

    object[field] = _.isFunction(alt) ? alt() : alt

    return object[field]
}

function getPortOfUrl(url: string) {
    const lastSepIndex = url.lastIndexOf(":")
    const port = lastSepIndex >= 0 ?
        url.substring(lastSepIndex + 1) : 80
    return port
}

export function isUserHasFieldAction(user: any, entityName: string,
    fieldName: string, action: string) {
    const acl = user.acl
    if (!acl) return false

    const aclField = acl.field
    if (!aclField) return false

    const aclFieldForEntity = aclField[entityName]
    if (!aclFieldForEntity) return false

    const aclFieldForEntityField = aclFieldForEntity[fieldName]
    if (!aclFieldForEntityField) return false

    return aclFieldForEntityField[action]
}

export function isUserOrRoleHasFieldAction(user: any, entityName: string,
    fieldName: string, action: string) {
    if (!user) return false
    if (isUserHasFieldAction(user, entityName, fieldName, action))
        return true
    if (user.roles)
        for (const roleName in user.roles) {
            if (user.roles.hasOwnProperty(roleName)) continue
            const role = user.roles[roleName]
            if (isUserHasFieldAction(role, entityName, fieldName,
                action)) return true
        }

    return false
}

// null safe, trim element
export function splitString(str: string | null | undefined, s: string) {
    if (!str) return null
    str = _.trim(str)
    if (!str) return null

    const a1 = _.split(str, s)
    const a2 = []
    for (const a of a1) {
        const i = _.trim(a)
        if (i) a2.push(i)
    }
    return a2
}

// 确保返回 origin 带端口，即使是 80 端口
export function getUrlOriginWithPort(urlObject: URL.URL) {
    let origin = urlObject.origin
    const port = urlObject.port || 80
    if (!origin.match(new RegExp(`:${port}$`))) {
        origin = origin + `:${port}`
    }
    return origin
}

export function firstValueOfObject(object: any) {
    for (const name in object) {
        if (!object.hasOwnProperty(name)) continue
        return object[name]
    }
    return null
}

export function entityListToIdMap(list: EntityValue[]) {
    const map: {[k: string]: EntityValue} = {}
    for (const i of list) map[i._id] = i
    return map
}

export function listToMap(list: EntityValue[], keyField: string) {
    const map: {[k: string]: EntityValue}  = {}
    for (const i of list) map[i[keyField]] = i
    return map
}

export function objectIdsEquals(a: ObjectID | null | undefined,
    b: ObjectID | null | undefined) {
    return _.isNull(a) && _.isNull(b) || a && b && a.toString() === b.toString()
}
