// cSpell:words multipart

import * as http from "http"
import * as Koa from "koa"
import koaBody = require("koa-body")
import * as Pug from "koa-pug"
import enableDestroy = require("server-destroy")
import Config from "../Config"
import { Error401, Error403, UserError } from "../Errors"
import { extension } from "../Extension"
import { aControlAccess, aIdentifyUser } from "../handler/AccessController"
import { RouteInfo } from "../index"
import { logSystemError } from "../Log"
import { aHandleRoute, Router } from "./Router"

let server: http.Server

export const pugLocals = {}

export async function aStart(router: Router) {
    configKoaServer(router)

    server.on("error", err => logSystemError(err, "HTTP server fire error"))
    server.on("close", () => logSystemError("HTTP server fire close!"))
    server.on("timeout", () => logSystemError("HTTP server fire timeout!"))

    enableDestroy(server)

    return new Promise((resolve, reject) => {
        server.listen(Config.serverPort, (error: Error) => {
            if (error) return reject(error)
            resolve(true)
        })
    })
}

export function stop(stopOther: () => void) {
    if (server) {
        server.on("close", stopOther)
        server.destroy()
    } else {
        stopOther()
    }
}

function configKoaServer(router: Router) {
    const koaServer = new Koa()
    koaServer.keys = [Config.cookieKey]
    koaServer.proxy = true

    // pug
    const pug = new Pug({
        viewPath: Config.serverPugPath,
        locals: pugLocals,
        noCache: process.env.DEV === "1"
    })

    pug.use(koaServer as any)

    router.refresh()

    koaServer.use((ctx, next) => router.aParseRoute(ctx, next))

    koaServer.use(aCatchError) // 匹配路由的过程不需要拦截错误

    koaServer.use(aIdentifyUser)
    koaServer.use(aControlAccess)

    // 控制访问之后再解析正文
    const formidableConfig = {
        uploadDir: Config.uploadPath,
        keepExtensions: true,
        maxFieldsSize: Config.httpBodyMaxFieldsSize
    }
    koaServer.use(koaBody({multipart: true, formidable: formidableConfig}))

    if (extension.aKoaMiddlewareBeforeHandler)
        koaServer.use(extension.aKoaMiddlewareBeforeHandler)

    koaServer.use(aHandleRoute) // 开始处理路由

    server = http.createServer(koaServer.callback())

    let timeout = Config.serverSocketTimeout
    if (!(timeout >= 0)) timeout = 10 * 60 * 1000
    server.setTimeout(timeout)
}

async function aCatchError(ctx: Koa.Context, next: any) {
    const routeInfo = (ctx.state.route.info || {}) as RouteInfo
    const aErrorCatcher = routeInfo.aErrorCatcher
    if (aErrorCatcher) {
        await aErrorCatcher(ctx, next)
    } else {
        try {
            await next()
        } catch (e) {
            if (e instanceof Error401) {
                const originConfig = Config.originConfigs[ctx.request.origin]
                // console.log(originConfig, originConfig)
                const signInUrl = originConfig.ssoServer + "/api/c/sso/auth"
                if (routeInfo.isPage) {
                    ctx.redirect(signInUrl)
                } else {
                    ctx.status = 401
                    ctx.body = {signInUrl}
                }
            } else if (e instanceof Error403) {
                ctx.status = 403
                ctx.body = e.describe()
            } else if (e instanceof UserError) {
                ctx.status = 400
                ctx.body = e.describe()
            } else {
                ctx.status = 500
                logSystemError(e, e.message, "catch all")
            }
        }
    }
}
