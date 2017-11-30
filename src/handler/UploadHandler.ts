// cSpell:words CKEDITOR

import koa = require("koa")
import Path = require("path")
import Config from "../Config"
import { UserError } from "../Errors"
import { aMoveFileTo } from "../FileUtil"
import { getEntityMeta, newObjectId } from "../Meta"
import { firstValueOfObject } from "../Util"

interface File {
    size: number
    path: string
}

// H5上传
export async function aUpload(ctx: koa.Context) {
    const result = await aDoUpload(ctx.request.body.files, ctx.query)

    if (result)
        ctx.body = result
    else
        ctx.status = 400
}

// Transport 上传
export async function aUpload2(ctx: koa.Context) {
    let result = await aDoUpload(ctx.request.body.files, ctx.query) as any
    if (result)
        result.success = true
    else
        result = {success: false}
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
    const fileTargetDir = Path.join(Config.fileDir, subDir)

    const fileSize = file.size

    const fileFinalFullPath = Path.join(fileTargetDir,
        newObjectId().toString() + Path.extname(file.path))
    await aMoveFileTo(file.path, fileFinalFullPath)

    const fileRelativePath = Path.relative(Config.fileDir, fileFinalFullPath)

    return {fileRelativePath, fileSize}
}

async function aDoUpload(files: {[k: string]: File}, query: any) {
    if (!files) return null

    const fileKey = Object.keys(files)[0]
    if (!fileKey) return null
    const file = files[fileKey]

    const entityName = query.entityName
    const fieldName = query.fieldName

    if (!(entityName && fieldName)) return false

    const entityMeta = getEntityMeta(entityName)
    if (!entityMeta)
        throw new UserError("NoSuchEntity", "无此实体 " + entityName)
    const fieldMeta = entityMeta.fields[fieldName]
    if (!fieldMeta)
        throw new UserError("NoSuchEntityField",
            `无此字段 ${entityName}.${fieldName}`)

    const subDir = fieldMeta.fileStoreDir || "default"
    const fileTargetDir = Path.join(Config.fileDir, subDir)

    const fileFinalFullPath = Path.join(fileTargetDir,
        newObjectId().toString() + Path.extname(file.path))
    await aMoveFileTo(file.path, fileFinalFullPath)

    const fileRelativePath = Path.relative(Config.fileDir, fileFinalFullPath)

    return {fileRelativePath, fileSize: file.size}
}
