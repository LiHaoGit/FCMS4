// cSpell:words FCMS

import moment = require("moment")

import Config from "./Config"

import { configLoggers, logSystemError, logSystemInfo } from "./Log"
import * as Meta from "./Meta"
import * as UserService from "./security/UserService"
import * as MongoIndex from "./storage/MongoIndex"
import * as Mongo from "./storage/MongoStore"
// const Mysql = require("./storage/Mysql")
// const RefactorMysqlTable = require("./storage/RefactorMysqlTable")
import * as Redis from "./storage/RedisStore"
import * as SystemInit from "./SystemInit"
import { addCommonRouteRules } from "./web/CommonRouterRules"
import { Router } from "./web/Router"
import * as WebServer from "./web/WebServer"

let webStarted = false

moment.locale("zh-cn")

export async function aStart(appConfig: IConfig,
    addRouteRules: (router: Router) => void,
    extraEntities: {[k: string]: EntityMeta}) {

    console.log("--- Starting FCMS")

    process.on("SIGINT", onProcessTerm)
    process.on("SIGTERM", onProcessTerm)

    try {
        Object.assign(Config, appConfig)

        Config.preprocess()

        configLoggers(Config.logConfigs)

        logSystemInfo("Starting FCMS...")

        // 持久层初始化
        Mongo.init()
        // Mysql.init()

        if (Config.cluster) await Redis.aInit()

        // 元数据
        await Meta.aLoad(extraEntities)

        // 初始化数据库结构、索引
        await MongoIndex.aSyncWithMeta()

        // if (Mysql.mysql) {
        //     await RefactorMysqlTable.aSyncSchema(exports.mysql)
        //     const MysqlIndex = require("./storage/MysqlIndex")
        //     await MysqlIndex.aSyncWithMeta(exports.mysql)
        // }

        // 用户
        UserService.init()

        //
        await SystemInit.aInit()

        // 路由表
        const router = new Router()

        addCommonRouteRules(router)
        if (addRouteRules) addRouteRules(router)

        logSystemInfo("Starting the web server...")
        await WebServer.aStart(router)
        webStarted = true
        logSystemInfo("Web server started!")
    } catch (e) {
        console.log(e)
        stop()
    }
}

function stop() {
    return aStop().then(function() {
        process.exitCode = 0
    }).catch(function(e) {
        logSystemError(e, "stop")
        process.exitCode = 1
    })
}

async function aStop() {
    logSystemInfo("Disposing all other resources...")

    if (Config.cluster) await Redis.aDispose()

    await Mongo.aDispose()
    // await Mysql.aDispose()

    logSystemInfo("ALL CLOSED!\n\n")
}

function onProcessTerm() {
    console.log("\n\n\n\n\n")
    logSystemInfo("The process terminating...")

    if (webStarted) {
        logSystemInfo("Closing web server firstly...")
        // 先等待服务器关闭，再关闭 Mongo 等
        WebServer.stop(stop)
    } else {
        stop()
    }
}
