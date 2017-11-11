import Config from "../Config"

import * as MemoryCache from "./MemoryCache"
import * as RedisCache from "./RedisCache"

export async function aGetString(keyArray: string[], alternative?: string) {
    return Config.cluster ? RedisCache.aGetString(keyArray, alternative)
        : MemoryCache.aGetString(keyArray, alternative)
}
export async function aSetString(keyArray: string[], value: string) {
    Config.cluster ? RedisCache.aSetString(keyArray, value)
        : MemoryCache.aSetString(keyArray, value)
}

export async function aGetObject(keyArray: string[], alternative?: object) {
    return Config.cluster ? RedisCache.aGetObject(keyArray, alternative)
        : MemoryCache.aGetObject(keyArray, alternative)
}
export async function aSetObject(keyArray: string[], value: object) {
    Config.cluster ? RedisCache.aSetObject(keyArray, value)
        : MemoryCache.aSetObject(keyArray, value)
}

/**
 * keysArray, lastKeys 都是数组。
 * 例如 aUnset(["a","b"],["1","2"] 可以删除键 "a.b.1" 和 "a.b.2"
 */
export async function aUnset(keyArray: string[], lastKeys?: string[]) {
    Config.cluster ? RedisCache.aUnset(keyArray, lastKeys)
        : MemoryCache.aUnset(keyArray, lastKeys)
}

export async function aClearAllCache() {
    Config.cluster ? RedisCache.aClearAllCache() : MemoryCache.aClearAllCache()
}
