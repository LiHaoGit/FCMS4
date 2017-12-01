// cSpell:words Captcha
import Chance = require("chance")
import koa = require("koa")
import { aGetString, aSetString, aUnset } from "../cache/Cache"

const chance = new Chance()

export async function aGenerate(ctx: koa.Context) {
    const simpleCaptcha = require("simple-captcha")
    const captcha = simpleCaptcha.create({width: 100, height: 40})
    const text = captcha.text()
    captcha.generate()

    const id = chance.hash()
    ctx.cookies.set("captcha_id", id, {signed: true, httpOnly: true})
    await aSetString(["captcha", id], text)

    ctx.set("X-Captcha-Id", id)
    ctx.body = captcha.buffer("image/png")
    ctx.type = "image/png"
}

export async function aCheck(id: string, text: string) {
    if (!(id && text)) return false
    const expected = await aGetString(["captcha", id])
    return expected && text && expected.toLowerCase() === text.toLowerCase()
}

export async function aClearById(id: string) {
    await aUnset(["captcha"], [id])
}

