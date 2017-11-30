import _ = require("lodash")
import { logSystemDebug } from "../Log"
import { getMainClient } from "../storage/RedisStore"
import { jsObjectToTypedJSON, typedJSONToJsObject } from "../Util"

const keySeparator = ":"

export async function aGetString(keyArray: string[], alternative?: string) {
    const key = keyArray.join(keySeparator)
    const client = getMainClient()
    const value = await client.getAsync(key)
    return _.isNil(value) ? alternative : value
}
export async function aSetString(keyArray: string[], value: string) {
    const key = keyArray.join(keySeparator)
    const client = getMainClient()
    await client.setAsync(key, value)
}

export async function aGetObject(keyArray: string[], alternative?: object) {
    const str = await aGetString(keyArray)
    const json = str && JSON.parse(str) || null
    return typedJSONToJsObject(json)
}
export async function aSetObject(keyArray: string[], value: object) {
    value = jsObjectToTypedJSON(value)
    const str = value && JSON.stringify(value) || ""
    await aSetString(keyArray, str)
}

/**
 * keysArray, lastKeys 都是数组。
 * 例如 aUnset(["a","b"],["1","2"] 可以删除键 "a.b.1" 和 "a.b.2"
 */
export async function aUnset(keyArray: string[], lastKeys?: string[]) {
    const client = getMainClient()

    if (lastKeys && lastKeys.length) {
        keyArray = _.clone(keyArray)
        const keysLength = keyArray.length
        const keys2 = []
        for (const lastKey of lastKeys) {
            keyArray[keysLength] = lastKey
            keys2.push(keyArray.join(keySeparator))
        }
        keyArray = keys2
    } else {
        const key = keyArray.join(keySeparator) + "*"
        keyArray = await client.keysAsync(key)
    }

    logSystemDebug("unset redis keys", keyArray)
    if (keyArray.length) client.mDelAsync(keyArray)
}

export async function aClearAllCache() {
    const client = getMainClient()

    const keys = await client.keysAsync("*")
    await Promise.all(keys.map(key => client.delAsync(key)))
}
