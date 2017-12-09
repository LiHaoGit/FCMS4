import koa = require("koa")
import rp = require("request-promise-native")
import Config from "../Config"
import { SystemError, UserError } from "../Errors"
import { logSystemDebug, logSystemError } from "../Log"
import { aSignInSuccessfully } from "../security/UserService"
import { aFindOneById } from "../service/EntityService"
import { setSingedPortedCookies } from "../Util"

// SSO 客户端接收 SSO 服务器的 TOKEN 回调
export async function aAcceptToken(ctx: koa.Context) {
    const token = ctx.query.token
    const origin = ctx.request.origin

    const originConfig = Config.originConfigs[origin]
    if (!originConfig) throw new UserError("BadClient", "Bad Client")

    let callback = ctx.query.callback
    callback = callback ? decodeURIComponent(callback) :
        originConfig.defaultCallbackUrl

    const options = {
        method: "POST",
        uri: originConfig.ssoServer + "/sso/validate-token",
        body: {key: originConfig.ssoKey, token, origin},
        json: true
    }
    try {
        const res = await rp(options)
        logSystemDebug("res", res)
        if (!res) throw new SystemError("ValidateTokenFail",
            "Failed to Validate Token")

        const userId = res.userId
        const user = await aFindOneById({}, "F_User", userId)

        const session = await aSignInSuccessfully(origin, user)

        // TODO 把设置本机登录 Cookies 的放在一处
        setSingedPortedCookies(ctx,
            {UserId: session.userId, UserToken: session.userToken})

        ctx.redirect(callback)
    } catch (e) {
        logSystemError(e, "aAcceptToken")
        throw e
    }
}

export async function aSignOut(ctx: koa.Context) {
    const origin = ctx.request.origin

    const originConfig = Config.originConfigs[origin]
    if (!originConfig) throw new UserError("BadClient", "Bad Client")

    let callback = ctx.query.callback
    callback = callback ? decodeURIComponent(callback) :
        originConfig.defaultCallbackUrl

    ctx.redirect(originConfig.ssoServer + "/sso/sign-out?callback=" +
        encodeURIComponent(callback))
}
