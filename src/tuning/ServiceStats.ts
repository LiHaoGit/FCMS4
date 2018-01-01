import moment = require("moment")
import Path = require("path")

import { clearInterval } from "timers"

import Config from "../Config"
import { aMakeDirRecursive, aWriteJSON } from "../FileUtil"
import { logSystemError, logSystemInfo } from "../Log"
import { setIfNone } from "../Util"

interface AccessTrace {
    [entityName: string]: {[action: string]: {[criteria: string]: number[]}}
}

let serviceTrace: AccessTrace = {}
let dbTrace: AccessTrace = {}

export function traceAccessService(entityName: string, action: string,
    criteria: string) {

    const traceOfEntity = setIfNone(serviceTrace, entityName, {})
    const traceOfAction = setIfNone(traceOfEntity, action, {})
    const traceOfCriteria = setIfNone<number[]>(traceOfAction, criteria, [])
    traceOfCriteria.push(Date.now())
}

export function traceQueryDB(entityName: string, action: string,
    criteria: string) {

    const traceOfEntity = setIfNone(dbTrace, entityName, {})
    const traceOfAction = setIfNone(traceOfEntity, action, {})
    const traceOfCriteria = setIfNone<number[]>(traceOfAction, criteria, [])
    traceOfCriteria.push(Date.now())
}

export async function aPersist() {
    logSystemInfo("Persist tuning data...")

    const serviceTraceNow = serviceTrace
    serviceTrace = {}
    const dbTraceNow = dbTrace
    dbTrace = {}

    const now = Date.now()
    const tuningFileDir = Config.tuningFileDir || __dirname
    const todayDir = Path.join(tuningFileDir, moment().format("YYYY-MM-DD"))

    await aMakeDirRecursive(todayDir)

    const serviceFile = Path.join(todayDir, `service-access-${now}.json`)
    await aWriteJSON(serviceFile, serviceTraceNow)

    const dbFile = Path.join(todayDir, `db-access-${now}.json`)
    await aWriteJSON(dbFile, dbTraceNow)
}

function persist() {
    aPersist().catch(e => {
        logSystemError(e, "persist tuning data")
    })
}

let persistTimer: NodeJS.Timer | null

export function startPersistingTuningData() {
    persist() // 立即执行一次
    persistTimer = setInterval(persist, 1000 * 60 * 10) // 10min
}

export async function aStopPersistingTuningData() {
    if (persistTimer) clearInterval(persistTimer)
    persistTimer = null

    await aPersist()
}
