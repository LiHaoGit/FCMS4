import bunyan = require("bunyan")

const loggers: {[s: string]: bunyan} = {}

export function config(logConfigs: {[k: string]: bunyan.LoggerOptions}) {
    logConfigs.system = logConfigs.system || {name: "system", level: "trace"}
    const logNames = Object.keys(logConfigs)
    for (const name of logNames) {
        const logConfig = logConfigs[name]
        loggers[name] = bunyan.createLogger(logConfig)
    }
}

export function getLogger(name: string) {
    return loggers[name]
}
