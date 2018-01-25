import { expect } from "chai"
import {
    aClearAllCache,
    aGetObject,
    aGetString,
    aSetObject,
    aSetString,
    aUnset
} from "../MemoryCache"

describe("MemoryCache", function() {
    it("get and set string value", async() => {
        const key = ["one,", "two"]
        const value = "cache"
        await aSetString(key, value)
        const result = await aGetString(key)
        expect(result).to.equal("cache")
    })

    it("get and set object", async() => {
        const obj = { name: "123" }
        const key = ["one,", "two"]
        await aSetObject(key, obj)
        const result = await aGetObject(key)
        expect(result).to.equal(obj)
    })

    it("clear all value", async() => {
        for (let index = 0; index < 5; index++) {
            const key = ["one,", index + "" ]
            await aSetObject(key, { name: index})
        }
        await aClearAllCache()
        for (let index = 0; index < 5; index++) {
            const key = ["one,", index + "" ]
            const result = await aGetObject(key)
            expect(result).to.equal(undefined)
        }
    })
})
