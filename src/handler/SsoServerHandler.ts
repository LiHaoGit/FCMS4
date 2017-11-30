import Chance = require("chance")
import koa = require("koa")
import URL = require("url")

import Config from "../Config"
import { UserError } from "../Errors"
import { logSystemDebug } from "../Log"
import { checkPasswordEquals } from "../Meta"
import { aCreate, aFindOneByCriteria,
    aRemoveManyByCriteria } from "../service/EntityService"
import { getUrlOriginWithPort } from "../Util"

const chance = new Chance()

// SSO 客户端请求该接口
// 如果 SSO 已登录，则产生一个 TOKEN 回调客户端校验 TOKEN 的接口
// 如果 SSO 没有登录，则让客户端跳转到 SSO 登录页
export async function aAuth(ctx: koa.Context) {
    const userId = ctx.cookies.get("SsoUserId", {signed: true})
    const userToken = ctx.cookies.get("SsoUserToken", {signed: true})

    const callback = ctx.query.callback
    if (!callback)
        throw new UserError("MissingCallback", "Missing Callback")
    const encodedCallback = encodeURIComponent(callback)

    const session = await aValidSsoSession(userId, userToken)
    if (!session) {
        const redirect = ctx.request.origin +
            `/sso/sign-in?callback=${encodedCallback}`
        ctx.redirect(redirect)
        return
    }

    const callbackUrl = new URL.URL(callback)
    const callbackOrigin = getUrlOriginWithPort(callbackUrl)
    const clientConfig = Config.ssoServer.clients[callbackOrigin]
    if (!clientConfig)
        throw new UserError("UnknownClient",
            "Unknown Client: " + callbackOrigin)

    let {acceptTokenUrl} = clientConfig

    let token = await aNewClientToken(callbackOrigin, userId)
    token = encodeURIComponent(token)

    acceptTokenUrl += `?callback=${encodedCallback}&token=${token}`
    ctx.redirect(acceptTokenUrl)
}

// SSO 前端页面请求登录
export async function aSignIn(ctx: koa.Context) {
    const req = ctx.request.body
    if (!(req.username && req.password))
        throw new UserError("MissingFields", "字段不全")

    const session = await aDoSignIn(req.username, req.password)
    ctx.body = {userId: session.userId}

    ctx.cookies.set("SsoUserId", session.userId,
        {signed: true, httpOnly: true})
    ctx.cookies.set("SsoUserToken", session.userToken,
        {signed: true, httpOnly: true})
}

// 校验 SSO 客户端接受到的 TOKEN 的真实性
export async function aValidateToken(ctx: koa.Context) {
    const req = ctx.request.body
    if (!req) throw new UserError("MissingFields", "字段不全")

    const clientConfig = Config.ssoServer.clients[req.origin]
    if (!clientConfig)
        throw new UserError("UnknownClient",
            "Unknown Client: " + req.origin)
    // 校验客户端的通信密钥
    if (clientConfig.key !== req.key)
        throw new UserError("BadClientKey", "Bad Client Key")

    const ct = await aFindOneByCriteria({}, "F_SsoClientToken",
        {origin: req.origin, token: req.token})
    if (!ct) {
        logSystemDebug(`Bad Token: ${req.token}/${req.origin}`)
        throw new UserError("BadToken", "Bad Token")
    }
    // 只能用一次，检验后就删除
    await aRemoveManyByCriteria({}, "F_SsoClientToken", {_id: ct._id})

    // 判断是否过期
    if (Date.now() - ct._createdOn.getTime() > 10000)
        throw new UserError("TokenExpired", "Token Expired")

    ctx.body = {userId: ct.userId}
}

export async function aSignOut(ctx: koa.Context) {
    const userId = ctx.cookies.get("SsoUserId", {signed: true})
    const userToken = ctx.cookies.get("SsoUserToken", {signed: true})

    const callback = ctx.query.callback
    if (!callback)
        throw new UserError("MissingCallback", "Missing Callback")
    const encodedCallback = encodeURIComponent(callback)

    const session = await aValidSsoSession(userId, userToken)
    if (!session) {
        ctx.status = 401
        return
    }

    // 退出 SSO
    await aDoSignOut(userId)

    // 退出所有客户端
    await aRemoveManyByCriteria({}, "F_UserSession", {userId})

    const redirect = ctx.request.origin +
        `/sso/sign-in?callback=${encodedCallback}`
    ctx.redirect(redirect)
}

async function aValidSsoSession(userId: string, userToken: string) {
    const session = await aFindOneByCriteria({}, "F_SsoSession", {userId})
    if (!session) return false

    if (session.userToken !== userToken) {
        const errObj = {userId, userToken, sessionUserToken: session.userToken}
        logSystemDebug("token not match", errObj)
        return false
    }

    if (session.expireAt < Date.now()) {
        // Log.debug('token expired', { userId, expireAt: session.expireAt })
        return false
    }
    return session
}

// origin 的形式是 http://www.baidu.com:80
async function aNewClientToken(origin: string, userId: string) {
    const token = chance.string({length: 24})

    // TODO 记录客户浏览器的 IP，记录此 TOKEN 授予的 IP
    const ct = {userId, origin, token, _createdOn: new Date()}
    await aCreate({}, "F_SsoClientToken", ct)
    return token
}

async function aDoSignIn(username: string, password: string) {
    if (!password) throw new UserError("PasswordNotMatch")

    let usernameFields = Config.usernameFields
    if (!(usernameFields && usernameFields.length))
        usernameFields = ["username", "phone", "email"]

    const matchFields = []
    for (const f of usernameFields)
        matchFields.push({field: f, operator: "==", value: username})
    const criteria = {__type: "relation", relation: "or", items: matchFields}

    const user = await aFindOneByCriteria({}, "F_User", criteria)

    if (!user) throw new UserError("UserNotExisted")
    if (user.disabled) throw new UserError("UserDisabled")
    if (!checkPasswordEquals(user.password, password))
        throw new UserError("PasswordNotMatch")

    const session = {
        userId: user._id,
        userToken: chance.string({length: 24}),
        expireAt: Date.now() + Config.sessionExpireAtServer
    }

    await aDoSignOut(user._id) // 先退出
    await aCreate({}, "F_SsoSession", session)

    return session
}

async function aDoSignOut(userId: string) {
    const criteria = {userId}
    await aRemoveManyByCriteria({}, "F_SsoSession", criteria)
}
