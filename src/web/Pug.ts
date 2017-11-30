import * as Pug from "koa-pug"
import Config from "../Config"

export const pugLocals = {}

export const pug = new Pug({
    viewPath: Config.serverPugPath,
    locals: pugLocals,
    noCache: process.env.DEV === "1"
})
