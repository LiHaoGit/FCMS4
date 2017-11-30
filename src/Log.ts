import bunyan = require("bunyan")

const loggers: {[s: string]: bunyan} = {}

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
    loggers.system.info(...args)
}

export function logSystemWarn(...args: any[]) {
    loggers.system.warn(...args)
}

export function logSystemError(...args: any[]) {
    loggers.system.error(...args)
}

export function logSystemDebug(...args: any[]) {
    loggers.system.debug(...args)
}
