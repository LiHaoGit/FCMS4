import koa = require("koa")

import { UserError } from "../Errors"
import { aAnalyzeFile } from "../file/FileClean"
import { logSystemError } from "../Log"

export async function aHandleAnalyzeFile(ctx: koa.Context) {
    const cleanIncludeDirs = ctx.request.body
    // ["default", "RichText", "UserDefault"]
    if (!cleanIncludeDirs) throw new UserError("CleanIncludeDirsRequired")

    // 异步
    aAnalyzeFile(cleanIncludeDirs).catch(e => {
        logSystemError(e, "clean files")
    })

    ctx.status = 204
}
