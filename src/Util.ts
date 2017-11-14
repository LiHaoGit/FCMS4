import _ = require("lodash")
import mongodb = require("mongodb")

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
