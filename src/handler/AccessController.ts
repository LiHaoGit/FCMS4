import * as koa from "koa"
import Config from "../Config"
import { Error401, Error403, UserError } from "../Errors"
import { logSystemError } from "../Log"
import { aAuthToken, aGetAnonymousRole,
    aRoleById } from "../security/UserService"
import { getMyRequestHeaders , getSingedPortedCookies } from "../Util"

export async function aIdentifyUser(ctx: koa.Context, next: any) {
    // Log.debug("originalUrl", ctx.request.originalUrl)
    // Log.debug("url", ctx.request.url)
    // Log.debug("origin", ctx.request.origin)
    // Log.debug("href", ctx.request.href)
    // Log.debug("host", ctx.request.host)
    // Log.debug("hostname", ctx.request.hostname)
    // Log.debug("URL", ctx.request.URL)
    // Log.debug("ip", ctx.request.ip)
    // Log.debug("ips", ctx.request.ips)

    const originConfig = Config.originConfigs[ctx.request.origin]
    if (!originConfig) throw new UserError("BadOrigin",
        "BadOrigin " + ctx.request.origin)

    let [trackId, userId, userToken] =
        getSingedPortedCookies(ctx, "TID", "UserId", "UserToken")
    if (!(trackId || userId || userToken)) {
        [trackId, userId, userToken] =
            getMyRequestHeaders(ctx, "TID", "UserId", "UserToken")
    }

    ctx.state.trackId = trackId

    const origin = ctx.request.origin

    if (userId && userToken)
        try {
            const user = await aAuthToken(origin, userId, userToken)
            // Log.debug('auth token: ', user)
            if (user) ctx.state.user = user
        } catch (e) {
            return
        }

    await next()
}

export async function aControlAccess(ctx: koa.Context, next: any) {
    const pass = await aCheckAll(ctx)
    if (!pass)
        throw ctx.state.user ? new Error403() : new Error401()
    await next()
}

async function aCheckAll(httpCtx: koa.Context) {
    const state = httpCtx.state
    const route = state.route

    const ri = route.info as RouteInfo
    if (!(ri.auth || ri.action)) return true // 明确表示不需要登录直接返回 true

    if (state.user && state.user.admin) return true // admin 跳过一切权限

    if (ri.action) {
        // 有指定权限的
        return aCheckUserHasAction(state.user, ri.action)
    } else if (ri.auth) {
        // 只要登录即可，无权限
        return !!state.user
    } else if (ri.authEntity) {
        const aAuthHandler = (authHandlers as any)[ri.authEntity]
        if (!aAuthHandler) {
            logSystemError("No auth handler for " + ri.auth)
            return false
        }

        return aAuthHandler(httpCtx)
    }
}

// 检查用户是否有固定权限
async function aCheckUserHasAction(user: any, action: string) {
    if (!user) return false

    if (user.acl && user.acl.action && user.acl.action[action]) return true

    const roles = user.roles
    if (roles)
        for (const roleId of roles) {
            const role = await aRoleById(roleId)
            if (role && role.acl && role.acl.action && role.acl.action[action])
                return true
        }
    return false
}

const authHandlers = {
    async listEntity(httpCtx: koa.Context) {
        return aCheckUserHasEntityAction(httpCtx.state.user, "List",
            httpCtx.state.params.entityName)
    },
    async getEntity(httpCtx: koa.Context) {
        return aCheckUserHasEntityAction(httpCtx.state.user, "Get",
            httpCtx.state.params.entityName)
    },
    async createEntity(httpCtx: koa.Context) {
        return aCheckUserHasEntityAction(httpCtx.state.user, "Create",
            httpCtx.state.params.entityName)
    },
    async updateOneEntity(httpCtx: koa.Context) {
        return aCheckUserHasEntityAction(httpCtx.state.user,
            "UpdateOne", httpCtx.state.params.entityName)
    },
    async updateManyEntity(httpCtx: koa.Context) {
        return aCheckUserHasEntityAction(httpCtx.state.user,
            "UpdateMany", httpCtx.state.params.entityName)
    },
    async removeEntity(httpCtx: koa.Context) {
        return aCheckUserHasEntityAction(httpCtx.state.user, "Remove",
            httpCtx.state.params.entityName)
    },
    async recoverEntity(httpCtx: koa.Context) {
        return aCheckUserHasEntityAction(httpCtx.state.user,
            "Recover", httpCtx.state.params.entityName)
    }
}

async function aCheckUserHasEntityAction(user: any, action: string,
    entityName: string) {
    if (user) {
        let entityAcl = user.acl && user.acl.entity &&
            user.acl.entity[entityName]
        if (entityAcl && (entityAcl["*"] || entityAcl[action])) return true

        const roles = user.roles
        if (roles)
            for (const roleId of roles) {
                const role = await aRoleById(roleId)
                if (role) {
                    entityAcl = role && role.acl && role.acl.entity &&
                        role.acl.entity[entityName]
                    if (entityAcl && (entityAcl["*"] || entityAcl[action]))
                        return true
                }
            }
    } else {
        const role = await aGetAnonymousRole()
        if (role) {
            const entityAcl = role.acl && role.acl.entity &&
                role.acl.entity[entityName]
            if (entityAcl && (entityAcl["*"] || entityAcl[action])) return true
        }
    }
    return false
}
