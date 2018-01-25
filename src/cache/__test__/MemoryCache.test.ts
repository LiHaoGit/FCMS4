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
    it("get one", async() => {
        const key = ["one,", "two"]
        const value = "cache"
        await aSetString(key, value)
        const result = await aGetString(key)
        expect(result).to.equal("cache")
    })



})
