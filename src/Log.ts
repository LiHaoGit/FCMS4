import bunyan = require("bunyan")

// 默认初始化日志 system error
const loggers: {[s: string]: bunyan} = {
    system: bunyan.createLogger({name: "system", level: "error"})
}

export function configLoggers(logConfigs: {[k: string]: bunyan.LoggerOptions}) {
    logConfigs.system = logConfigs.system || {name: "system", level: "trace"}
    const logNames = Object.keys(logConfigs)
    for (const name of logNames) {
        const logConfig = logConfigs[name]
        loggers[name] = bunyan.createLogger(logConfig)
    }
}

// export function getLogger(name: string) {
//     return loggers[name]
// }

export function logSystemInfo(...args: any[]) {
    if (loggers.system.info)
        loggers.system.info(...args)
}

export function logSystemWarn(...args: any[]) {
    if (loggers.system.warn)
        loggers.system.warn(...args)
}

export function logSystemError(...args: any[]) {
    if (loggers.system.error)
        loggers.system.error(...args)
}

export function logSystemDebug(...args: any[]) {
    if (loggers.system.debug)
        loggers.system.debug(...args)
}
