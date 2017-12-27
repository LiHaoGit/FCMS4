// cSpell:words CKEDITOR


import koa = require("koa")
import moment = require("moment")
import Path = require("path")

import Config from "../Config"
import { UserError } from "../Errors"
import { aMoveFileTo } from "../FileUtil"
import { getEntityMeta, newObjectId } from "../Meta"
import { firstValueOfObject } from "../Util"

export interface File {
    size: number
    path: string
    name: string
}

// H5上传
export async function aUpload(ctx: koa.Context) {
    const result = await aUploadForEntityField(ctx.request.body.files)

    if (result)
        ctx.body = result
    else
        ctx.status = 400
}

// Transport 上传
export async function aUpload2(ctx: koa.Context) {
    let result = await aUploadForEntityField(ctx.request.body.files) as any
    if (result) {
        result.success = true
    } else {
        result = {success: false}
    }
    ctx.body = '<textarea data-type="application/json">' +
        JSON.stringify(result) + "</textarea>"
}

// WangEditor 使用的图片上传接口
export async function aUploadForRichText(ctx: koa.Context) {
    const files = ctx.request.body.files
    if (!files) throw new UserError("NoFile", "无文件")
    const file = files.f0
    if (!file) throw new UserError("NoFile", "无文件f0")

    const result = await aUploadUtil(file, "RichText")
    ctx.type = "text/html"
    ctx.body = Config.fileDownloadPrefix + result.fileRelativePath
}

export async function aUploadForCkEditor(ctx: koa.Context) {
    const files = ctx.request.body.files
    if (!files) throw new UserError("NoFile", "无文件")
    const file = firstValueOfObject(files)
    if (!file) throw new UserError("NoFile", "无文件")

    // let CKEditor = ctx.query.CKEditor
    const CKEditorFuncNum = ctx.query.CKEditorFuncNum

    const result = await aUploadUtil(file, "RichText")
    const filePath = Config.fileDownloadPrefix + result.fileRelativePath

    const fn = "window.parent.CKEDITOR.tools.callFunction"
    const js = `${fn}("${CKEditorFuncNum}", "${filePath}", "");`
    ctx.body = "<script type=\"text/javascript\">" + js + "</script>"
}

export async function aUploadImageForCkEditor(ctx: koa.Context) {
    const files = ctx.request.body.files
    if (!files) throw new UserError("NoFile", "无文件")
    const file = firstValueOfObject(files)
    if (!file) throw new UserError("NoFile", "无文件")

    const result = await aUploadUtil(file, "RichText")
    const filePath = Config.fileDownloadPrefix + result.fileRelativePath

    ctx.body = {uploaded: 1, fileName: file.path, url: filePath}
}

export async function aUploadUtil(file: File, subDir: string) {
    const fileRelativePath = generateRelativePath(subDir,
        Path.extname(file.path))

    await aMoveFileTo(file.path, Path.join(Config.fileDir, fileRelativePath))

    return {fileRelativePath, fileSize: file.size, name: file.name}
}

// 不在按字段设置目录等。前端传来的数据，不可信，意义不大。
async function aUploadForEntityField(files: {[k: string]: File}) {
    if (!files) return null

    const fileKey = Object.keys(files)[0] // 只上传第一个文件
    if (!fileKey) return null
    const file = files[fileKey]

    const subDir = "default"
    const fileRelativePath = generateRelativePath(subDir,
        Path.extname(file.path))

    await aMoveFileTo(file.path, Path.join(Config.fileDir, fileRelativePath))

    return {fileRelativePath, fileSize: file.size, name: file.name}
}

// timeSlice: 是否要前缀时间分片的目录
function generateRelativePath(parentPath: string, extName: string,
    noTimeSlice?: boolean) {

    if (extName && extName[0] !== ".") extName = "." + extName
    const basenameWithExt = newObjectId().toString() + extName

    if (!noTimeSlice) {
        const m = moment()
        const ym = m.format("YYYY-MM")
        const d = m.date()
        parentPath = Path.join(parentPath, ym, d.toString())
    }

    return Path.join(parentPath, basenameWithExt)
}
