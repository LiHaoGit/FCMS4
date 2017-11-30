// cSpell:words Captcha

import koa = require("koa")
import { UserError } from "../Errors"
import { aSendSecurityCodeToEmail,
    aSendSecurityCodeToPhone } from "../security/SecurityCodeService"
import { aCheck, aClearById } from "./CaptchaHandler"

// 发送验证码到手机
export async function aSendSignUpCodeToPhone(ctx: koa.Context) {
    await aCheckCaptcha(ctx)

    const phone = ctx.state.params.phone
    if (!phone) throw new UserError("NoPhone")
    await aSendSecurityCodeToPhone(phone)

    ctx.status = 204
}

// 发送验证码到邮箱
export async function aSendSignUpCodeToEmail(ctx: koa.Context) {
    await aCheckCaptcha(ctx)

    const email = ctx.state.params.email
    if (!email) throw new UserError("NoEmail")

    await aSendSecurityCodeToEmail(email)
    ctx.status = 204
}

async function aCheckCaptcha(ctx: koa.Context) {
    const req = ctx.request.body || {}
    const captchaId = req.captchaId ||
        ctx.cookies.get("captcha_id", {signed: true})
    const captchaText = req.captchaText

    if (!(captchaId && captchaText))
        throw new UserError("CaptchaWrong")

    if (!await aCheck(captchaId, captchaText)) {
        await aClearById(captchaId)
        throw new UserError("CaptchaWrong")
    }

    // 现在是不管验证码是否输入正确了一律只能用一次的策略
    await aClearById(captchaId)
}
