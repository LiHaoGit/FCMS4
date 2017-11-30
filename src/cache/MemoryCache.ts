import _ = require("lodash")
import { logSystemInfo } from "../Log"

let cache = {}

async function aGet<T>(keyArray: string[], alternative?: T): Promise<T> {
    const fieldNames = keyArray.join(".")
    // Log.debug('get memory cache', fieldNames)
    return Promise.resolve(_.get(cache, fieldNames) || alternative)
}

async function aSet<T>(keyArray: string[], value: T) {
    const fieldNames = keyArray.join(".")
    // Log.debug('set memory cache', fieldNames)
    await Promise.resolve(_.set(cache, fieldNames, value))
}

export async function aGetString(keyArray: string[], alternative?: string) {
    return aGet<string>(keyArray, alternative)
}
export async function aSetString(keyArray: string[], value: string) {
    await aSet<string>(keyArray, value)
}

export async function aGetObject(keyArray: string[], alternative?: object) {
    return aGet<object>(keyArray, alternative)
}
export async function aSetObject(keyArray: string[], value: object) {
    await aSet<object>(keyArray, value)
}

/**
 * keysArray, lastKeys 都是数组
 * 例如 aUnset(["a","b"],["1","2"] 可以删除键 "a.b.1" 和 "a.b.2"
 */
export async function aUnset(keyArray: string[], lastKeys?: string[]) {
    if (lastKeys && lastKeys.length) {
        const keys = _.clone(keyArray)
        const keysLength = keys.length
        for (const lastKey of lastKeys) {
            keys[keysLength] = lastKey
            _.unset(cache, keys.join("."))
        }
    } else {
        _.unset(cache, keyArray.join("."))
    }
}

export async function aClearAllCache() {
    logSystemInfo("clear all cache / memory")
    cache = {}
}
