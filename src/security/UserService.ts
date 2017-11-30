import * as Chance from "chance"
import * as _ from "lodash"
import * as mongodb from "mongodb"
import { aGetObject, aSetObject, aUnset } from "../cache/Cache"
import Config from "../Config"
import { UserError } from "../Errors"
import { extension } from "../Extension"
import { checkPasswordEquals, hashPassword, newObjectId } from "../Meta"
import { aCreate, aFindOneByCriteria, aRemoveManyByCriteria,
    aUpdateOneByCriteria } from "../service/EntityService"
import { onUpdatedOrRemoved } from "../service/EntityServiceCache"
import { inObjectIds } from "../Util"
import { permissionArrayToMap } from "./PermissionService"

const chance = new Chance()

const cacheKeyRoot = "user"

export function init() {
    onUpdatedOrRemoved(async(ctx, entityMeta, ids) => {
        if (entityMeta.name === "F_User") {
            if (ids)
                await aUnset([cacheKeyRoot, "user"], ids)
            else
                await aUnset([cacheKeyRoot, "user"])
        } else if (entityMeta.name === "F_UserRole") {
            await aUnset([cacheKeyRoot], ["anonymousRole"])

            if (ids)
                await aUnset([cacheKeyRoot, "role"], ids)
            else
                await aUnset([cacheKeyRoot, "role"])
        }
    })
}

export async function aUserById(id: string) {
    let user = await aGetObject([cacheKeyRoot, "user", id])
    if (user) return user

    user = await aFindOneByCriteria({}, "F_User", {_id: id})
    if (user) {
        user.acl = permissionArrayToMap(user.acl)
        await aSetObject([cacheKeyRoot, "user", id], user)
    }

    return user
}

export async function aRoleById(id: string) {
    let role = await aGetObject([cacheKeyRoot, "role", id])
    if (role) return role

    role = await aFindOneByCriteria({}, "F_UserRole", {_id: id})
    if (role) {
        role.acl = permissionArrayToMap(role.acl)
        await aSetObject([cacheKeyRoot, "role", id], role)
    }
    return role
}

export async function aRoleIdByName(name: string) {
    const role = await aFindOneByCriteria({}, "F_UserRole", {name},
        {includedFields: ["_id"]})
    return role && role._id
}

export async function aAddRemoveRoleNameToUser(userId: string,
    addRoles: string[] | null, removeRoles: string[] | null) {
    if (!(addRoles || removeRoles)) return

    const user = await aUserById(userId)
    let roles = user.roles || []

    if (addRoles) {
        const addRoleIds = await Promise.all(_.map(addRoles, aRoleIdByName))

        for (const id of addRoleIds)
            if (!inObjectIds(id, roles)) roles.push(id)
    }
    if (removeRoles) {
        const removeRoleIds = await Promise.all(_.map(removeRoles,
            aRoleIdByName))
        const roles2 = []
        for (const id of roles)
            if (!inObjectIds(id, removeRoleIds)) roles2.push(id)
        roles = roles2
    }

    await aUpdateOneByCriteria({}, "F_User", {_id: userId}, {roles})
    await aUnset([cacheKeyRoot, "user"], [userId])
}

export async function aGetAnonymousRole() {
    const anonymousRole = await aGetObject([cacheKeyRoot, "anonymousRole"])
    if (anonymousRole) return anonymousRole

    const role = await aFindOneByCriteria({}, "F_UserRole", {name: "anonymous"})
    if (role) {
        role.acl = permissionArrayToMap(role.acl)
        await aSetObject([cacheKeyRoot, "anonymousRole"], role)
    }
    return role
}

export async function aAuthToken(origin: string, userId: string,
    userToken: string) {
    const session = await aFindOneByCriteria({}, "F_UserSession",
        {origin, userId})
    if (!session) return false

    if (session.userToken !== userToken) {
        // Log.debug("token not match", {
        //     userId,
        //     userToken,
        //     sessionUserToken: session.userToken
        // })
        return false
    }

    if (session.expireAt < Date.now()) {
        // Log.debug("token expired", {userId, expireAt: session.expireAt})
        return false
    }

    return aUserById(userId)
}

// 登录
// TODO 思考：如果用户之前登录此子应用的 session 未过期，是返回之前的 session 还是替换 session
export async function aSignIn(origin: string, username: string,
    password: string) {
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

    const session = await aSignInSuccessfully(origin, user)

    return session
}

export async function aSignInSuccessfully(origin: string, user: any) {
    const session = {
        origin,
        userId: user._id,
        userToken: chance.string({length: 24}),
        expireAt: Date.now() + Config.sessionExpireAtServer
    }

    await aSignOut(origin, user._id) // 先退出
    await aCreate({}, "F_UserSession", session)

    return session
}

// 登出
export async function aSignOut(origin: string , userId: string) {
    const criteria = {userId, origin}
    await aRemoveManyByCriteria({}, "F_UserSession", criteria)
}

// 添加用户（核心信息）
export async function aAddUser(userInput: any) {
    const user: any = {
        _id: newObjectId().toString(), // 用户 ID 同一直接用字符串
        password: hashPassword(userInput.password)
    }

    if (userInput.username) user.username = userInput.username
    if (userInput.phone) user.phone = userInput.phone
    if (userInput.email) user.email = userInput.email

    await aCreate({}, "F_User", user)
}

// 修改绑定的手机
// exports.gChangePhone = (userId, phone)->
//     user = await Service.gFindOneByCriteria({}, 'F_User', {_id: userId})
//     throw new error.UserError("UserNotExisted") unless user?
//     throw new error.UserError("UserDisabled") if user.disabled
//
//     await Service.gUpdateOneByCriteria({}, 'F_User',
//         {_id: userId, _version: user._version}, {phone: phone})
//
//     await Cache.gUnset [cacheKeyRoot, 'user'], [userId]
//
// 修改绑定的邮箱
// exports.gChangeEmail = (userId, email)->
//     user = await Service.gFindOneByCriteria({}, 'F_User', {_id: userId})
//     throw new error.UserError("UserNotExisted") unless user?
//     throw new error.UserError("UserDisabled") if user.disabled
//
//     await Service.gUpdateOneByCriteria({}, 'F_User',
//         {_id: userId, _version: user._version}, {email: email})
//
//     await Cache.gUnset [cacheKeyRoot, 'user'], [userId]
//

// 修改密码
export async function aChangePassword(userId: string, oldPassword: string,
    newPassword: string) {
    const user = await aFindOneByCriteria({}, "F_User", {_id: userId})
    if (!user) throw new UserError("UserNotExisted")
    if (user.disabled) throw new UserError("UserDisabled")
    if (!checkPasswordEquals(user.password, oldPassword))
        throw new UserError("PasswordNotMatch")

    const update = {password: hashPassword(newPassword)}
    await aUpdateOneByCriteria({}, "F_User",
        {_id: userId, _version: user._version}, update)

    await aRemoveAllUserSessionOfUser(userId)
}

// 通过手机重置密码
// exports.gResetPasswordByPhone = (phone, password)->
//     user = await Service.gFindOneByCriteria({}, 'F_User', {phone: phone})
//     throw new error.UserError("UserNotExisted") unless user?
//     throw new error.UserError("UserDisabled") if user.disabled
//
//     update = {password: Meta.hashPassword(password)}
//     await Service.gUpdateOneByCriteria({}, 'F_User',
//         {_id: user._id, _version: user._version}, update)
//
//     await _gRemoveAllUserSessionOfUser user._id
//
// # 通过邮箱重置密码
// exports.gResetPasswordByEmail = (email, password)->
//     user = await Service.gFindOneByCriteria({}, 'F_User', {email: email})
//     throw new error.UserError("UserNotExisted") unless user?
//     throw new error.UserError("UserDisabled") if user.disabled
//
//     update = {password: Meta.hashPassword(password)}
//     await Service.gUpdateOneByCriteria({}, 'F_User',
//         {_id: user._id, _version: user._version}, update)
//
//     await _gRemoveAllUserSessionOfUser user._id
//

export function checkUserHasRoleId(user: any, roleId: mongodb.ObjectID) {
    const roleIdStr = roleId.toString()
    if (user.roles)
        for (const r of user.roles)
            if (r._id.toString() === roleIdStr) return true
    return false
}

async function aRemoveAllUserSessionOfUser(userId: string) {
    return aRemoveManyByCriteria({},  "F_UserSession", {useId: userId})
}
