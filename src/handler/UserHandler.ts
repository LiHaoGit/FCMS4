import koa = require("koa")
import _ = require("lodash")

import Config from "../Config"
import { UserError } from "../Errors"
import { aChangePassword as aChangePasswordService, aRoleById,
    aSignIn as aSignInService,
    aSignOut as aSignOutService } from "../security/UserService"
import { setSingedPortedCookies } from "../Util"

// const SecurityCodeService = require('../security/SecurityCodeService')

export function checkPasswordFormat(password: string, format: RegExp) {
    return format.test(password)
}

export function clearUserSessionCookies(ctx: koa.Context) {
    setSingedPortedCookies(ctx, {UserId: null, UserToken: null})
}

export async function aPing(ctx: koa.Context) {
    const user = ctx.state.user

    if (user) {
        const userToFront = _.clone(user)
        delete userToFront.password
        delete userToFront.disabled

        userToFront.roles = {}
        if (user.roles) {
            for (const roleId of user.roles) {
                const role = await aRoleById(roleId)
                userToFront.roles[role.name] = role
            }
        }
        ctx.body = userToFront
    } else {
        ctx.status = 401
    }
}

// 用户登录接口
export async function aSignIn(ctx: koa.Context) {
    const req = ctx.request.body
    if (!(req.username && req.password)) throw new UserError("MissingFields")

    const origin = ctx.request.origin
    const session = await aSignInService(origin, req.username, req.password)
    ctx.body = {userId: session.userId, userToken: session.userToken}

    setSingedPortedCookies(ctx,
        {UserId: session.userId, UserToken: session.userToken})
}

// 登出接口
export async function aSignOut(ctx: koa.Context) {
    await aSignOutService(ctx.request.origin, ctx.state.userId)

    // 清cookies
    clearUserSessionCookies(this)

    ctx.status = 204
}

// 用户修改密码接口
export async function aChangePassword(ctx: koa.Context) {
    const req = ctx.request.body

    if (!checkPasswordFormat(req.newPassword, Config.passwordFormat))
        throw new UserError("BadPasswordFormat")

    await aChangePasswordService(ctx.state.user._id,
        req.oldPassword, req.newPassword)

    // 清cookies
    clearUserSessionCookies(this)

    ctx.status = 204
}

// # 通过手机/email重置密码
// # phone/email, password, securityCode
// exports.gResetPassword = ->
//     req = ctx.request.body
//
//     unless checkPasswordFormat(req.password, config.passwordFormat)
//         throw new errors.UserError('BadPasswordFormat')
//
//     if req.phone?
//         SecurityCodeService.check(req.phone, req.securityCode)
//         await UserService.gResetPasswordByPhone(req.phone, req.password)
//     else if req.email?
//         SecurityCodeService.check(req.email, req.securityCode)
//         await UserService.gResetPasswordByEmail(req.email, req.password)
//     else
//         ctx.status = 400
//
//     ctx.status = 204
//
// # 用户修改手机接口
// exports.gChangePhone = ->
//     req = ctx.request.body
//
//     # 检查验证码
//     SecurityCodeService.check(req.phone, req.securityCode)
//
//     await UserService.gChangePhone(ctx.state.user._id, req.phone)
//
//     ctx.status = 204
//
// # 用户修改 Email
// exports.gChangeEmail = ->
//     req = ctx.request.body
//
//     # 检查验证码
//     SecurityCodeService.check(req.email, req.securityCode)
//
//     await UserService.gChangeEmail(ctx.state.user._id, req.email)
//
//     ctx.status = 204
//
