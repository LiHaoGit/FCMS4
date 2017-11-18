import * as Chance from "chance"
import { aGetObject, aSetObject, aUnset } from "../cache/Cache"
import {  UserError } from "../Errors"
import { extension } from "../Extension"

// const Promise = require('bluebird')
// const request = require('request')
// const pRequestPost = Promise.promisify(request.post.bind(request))

const chance = new Chance()

// 验证验证码
export async function aCheck(target: string, code: string) {
    const expectedCode = await aGetObject(["securityCodes", target])

    if (!(expectedCode && expectedCode.code === code))
        throw new UserError("SecurityCodeNotMatch")
    if (Date.now() - expectedCode.sendTime > 15 * 60 * 1000)
        throw new UserError("SecurityCodeExpired") // 过期

    await aUnset(["securityCodes"], [target])
}

// 发送验证码到邮箱
export async function aSendSecurityCodeToEmail(toEmail: string) {
    const code = await aGenerateSecurityCode(toEmail)
    extension.aSendSecurityCodeToEmail
        && extension.aSendSecurityCodeToEmail(toEmail, code)
}

// 发送验证码到手机
export async function aSendSecurityCodeToPhone(toPhone: string) {
    const code = await aGenerateSecurityCode(toPhone)
    extension.aSendSecurityCodeToPhone
        && extension.aSendSecurityCodeToPhone(toPhone, code)
}

async function aGenerateSecurityCode(address: string) {
    const code = chance.string({length: 6, pool: "0123456789"})
    await aSetObject(["securityCodes", address],
        {code, sendTime: new Date().getTime()})
    return code
}
