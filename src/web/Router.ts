// cSpell:words middlewares

// 匹配多个路由时，无变量路由直接胜出（至多只能有一个无变量的路由）。
// 有变量的路由，URL不同的部分，最先出现非变量路径的胜出。
// 如 abc/def/:1/ghi 比 abc/def/:1/:2 胜出。

import * as koa from "koa"
import * as compose from "koa-compose"
import * as _ from "lodash"

import { logSystemDebug } from "../Log"
import { setIfNone } from "../Util"

export interface RouteRule {
    method: string
    url: string
    info: RouteInfo
    handler: koa.Middleware
    indexToVariable: any
    routeWeight: number
}

interface RouteTermVar {
    terms: {[term: string]: string[]}
    variable: string[]
}

interface MappingOfMethod {[partNum: string]: RouteTermVar[]}

export class Router {
    // 路由表
    private routes: {[methodUrl: string]: RouteRule} = {}
    // mapping[method][length][index]
    // 如 mapping['get'] 是所有 get 的映射
    // mapping['get'][3] 是所有有三段路径的映射，如 /user/:name/detail
    // mapping['get'][3][i] 是第 i 段的映射， 0 <= i < 3
    private mapping: {[method: string]: MappingOfMethod} = {}
    private rootMapping: string

    // 让路由处理器根据最新的路由表解析
    refresh() {
        this.mapping = {get: {}, post: {}, put: {}, delete: {}}

        Object.keys(this.routes).forEach(methodUrl => {
            const route = this.routes[methodUrl]

            if (route.url === "" || route.url === "/") {
                this.rootMapping = methodUrl
                return
            }

            route.indexToVariable = {}

            const mOfMethod = this.mapping[route.method]

            const urlParts = splitPathPart(route.url)
            const partsNum = urlParts.length
            if (!mOfMethod[partsNum]) mOfMethod[partsNum] = []
            const mOfPartNum = mOfMethod[partsNum]

            let routeWeight = 0
            for (let index = 0; index < partsNum; index++) {
                const urlPart = urlParts[index]
                if (!mOfPartNum[index])
                    mOfPartNum[index] = {terms: {}, variable: []}
                const mOfIndex = mOfPartNum[index]

                if (urlPart[0] === ":") {
                    const name = urlPart.slice(1)
                    route.indexToVariable[name] = index
                    mOfIndex.variable.push(methodUrl)
                } else {
                    if (!mOfIndex.terms[urlPart])
                        mOfIndex.terms[urlPart] = []
                    const mOfTerm = mOfIndex.terms[urlPart]
                    mOfTerm.push(methodUrl)
                    routeWeight += (1 << (partsNum - index - 1))
                }
            }
            route.routeWeight = routeWeight
        })
    }

    // 解析意图
    async aParseRoute(ctx: koa.Context, next: () => Promise<any>) {
        const path = decodeURI(ctx.request.path)
        // Log.debug('parse route, path = ' + path)

        const params: {[k: string]: string} = {}
        const route = this.match(ctx.request.method, path, params)
        if (route) {
            ctx.state.params = params
            ctx.state.route = route
            await next()
        } else {
            logSystemDebug("Fail to match route",
                {method: ctx.request.method, path})
            ctx.status = 404
        }
    }

    match(method: string, path: string, params: {[k: string]: string}) {
        method = method.toLowerCase()
        if (path === "" || path === "/") {
            return this.routes[this.rootMapping]
        }

        const parts = splitPathPart(path)
        const mOfLength = this.mapping[method]
            && this.mapping[method][parts.length]
        if (!mOfLength) return null // 不匹配

        // 所有可能匹配的路由的 URL
        let possibleRouteUrl: {[routeKey: string]: boolean} = {}
        const partsNum = parts.length
        for (let index = 0; index < partsNum; index++) {
            const part = parts[index]
            const mOfIndex = mOfLength[index]
            if (!mOfIndex) return null // 不匹配
            if (index === 0) {
                // 初始集合
                possibleRouteUrl = collectRouteUrls(mOfIndex, part)
            } else {
                const newPossibleRouteUrl = collectRouteUrls(mOfIndex, part)
                // 取交集
                for (const u in possibleRouteUrl)
                    if (!newPossibleRouteUrl[u]) delete possibleRouteUrl[u]
            }
            if (!_.size(possibleRouteUrl)) return null
        }

        // 如果有多个匹配，变量出现位置靠后的胜出（没有变量的最胜）
        let maxRouteWeight = 0
        let finalRoute: RouteRule | null = null
        for (const routeKey in possibleRouteUrl) {
            const route = this.routes[routeKey]
            if (route.routeWeight > maxRouteWeight) {
                finalRoute = route
                maxRouteWeight = route.routeWeight
            }
        }
        if (!finalRoute) return null

        for (const name in finalRoute.indexToVariable) {
            const index = finalRoute.indexToVariable[name]
            params[name] = parts[index]
        }
        return finalRoute
    }

    addRouteRules(method: string, url: string, info: RouteInfo,
        ...handlers: koa.Middleware[]) {
        const key = method + url
        const handler = handlers.length === 1 ? handlers[0] : compose(handlers)
        this.routes[key] = {method, url, info, handler, indexToVariable: {},
            routeWeight: 0}
    }
}

// 路由规则注册器
export class RouteRuleRegisters {
    constructor(private urlPrefix: string,
        private errorCatcher: WebErrorCatcher | null,
        private router: Router) {
        if (!urlPrefix) throw new Error("urlPrefix cannot be empty")
        // 去掉后缀的斜线
        if (urlPrefix[urlPrefix.length - 1] === "/")
            urlPrefix = urlPrefix.substring(0, urlPrefix.length - 1)
        this.urlPrefix = urlPrefix
    }

    // 添加一个路由到路由表
    add(method: string, url: string, cfg: RouteConfig | null,
        ...handlers: koa.Middleware[]) {
        // 去掉 url 开头的斜线
        if (url === "" || url === "/")
            url = ""
        else if (url[0] === "/")
            url = url.substring(1)

        url = this.urlPrefix + "/" + url

        const info: RouteInfo = {
            urlPrefix: this.urlPrefix,
            errorCatcher: this.errorCatcher || undefined,
            auth: cfg && cfg.auth || undefined,
            authEntity: cfg && cfg.authEntity || undefined,
            action: cfg && cfg.action || undefined,
            isPage: cfg && cfg.isPage || undefined
        }

        this.router.addRouteRules(method, url, info, ...handlers)
    }

    // ---- 以下是添加路由规则的快捷方法

    get(url: string, cfg: RouteConfig | null, ...handlers: koa.Middleware[]) {
        this.add("get", url, cfg, ...handlers)
    }

    post(url: string, cfg: RouteConfig | null, ...handlers: koa.Middleware[]) {
        this.add("post", url, cfg, ...handlers)
    }

    put(url: string, cfg: RouteConfig | null, ...handlers: koa.Middleware[]) {
        this.add("put", url, cfg, ...handlers)
    }

    del(url: string, cfg: RouteConfig | null, ...handlers: koa.Middleware[]) {
        this.add("delete", url, cfg, ...handlers)
    }

    // 分别添加 List/Get/Create/Update 接口的路由
    listGetCreateUpdate(urlPrefix: string, info: RouteConfig | null,
        handlers: koa.Middleware[], ...middlewares: koa.Middleware[]) {
        if (handlers[0])
            this.add("get", urlPrefix, info, ...middlewares, handlers[0])
        if (handlers[1])
            this.add("get", `${urlPrefix}/:id`, info, ...middlewares,
            handlers[1])
        if (handlers[2])
            this.add("post", urlPrefix, info, ...middlewares, handlers[2])
        if (handlers[3])
            this.add("put", `${urlPrefix}/:id`, info, ...middlewares,
            handlers[3])
    }
}

// 执行路由的处理器
export async function aHandleRoute(ctx: koa.Context, next: () => Promise<any>) {
    await ctx.state.route.handler(ctx, next)
}

// 所有匹配 part 单词或变量的路由的 URL
function collectRouteUrls(mOfIndex: RouteTermVar, urlPart: string) {
    const possibleRouteMap: {[routeKey: string]: boolean} = {}
    let routeUrls = mOfIndex.terms[urlPart]
    if (routeUrls) for (const u of routeUrls) possibleRouteMap[u] = true

    routeUrls = mOfIndex.variable
    if (routeUrls) for (const u of routeUrls) possibleRouteMap[u] = true

    return possibleRouteMap
}

// 将路径切分，去首尾空（即去掉首尾的斜线）
function splitPathPart(aPath: string) {
    const parts = aPath.split("/")
    const partsStart = parts[0] ? 0 : 1
    const partsEnd = parts[parts.length - 1] ? parts.length : parts.length - 1
    return parts.slice(partsStart, partsEnd)
}

// test = ->
//     exports.addRouteRules('get', "/", {action: "index"}, (next)-> true)
//     exports.addRouteRules('get', "/home", {action: "home"}, (next)-> true)
//     exports.addRouteRules('get', "/meta", {action: "meta"}, (next)-> true)
//     exports.addRouteRules('post', "/meta", {action: "meta"}, (next)-> true)
//     exports.addRouteRules('put', "/meta/:name", {action: "meta"},
//         (next)-> true)
//     exports.addRouteRules('put', "/meta/_blank", {action: "meta"},
//         (next)-> true)
//     exports.addRouteRules('put', "/meta/:name/fields", {action: "meta"},
//         (next)-> true)
//     exports.addRouteRules('get', "/entity/:name/:id", {action: "entity"},
//         (next)-> true)
//     exports.refresh()
//
//     #log.debug JSON.stringify(rootMapping, null, 4)
//     log.debug("pathTree", JSON.stringify(mapping, null, 4))
//
//     params = {}
//     console.log(match('get', '/entity/User/1', params), params)
