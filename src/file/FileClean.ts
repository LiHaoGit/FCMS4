import _ = require("lodash")
import mongodb = require("mongodb")
import Path = require("path")

import Config from "../Config"
import { aListFilesRecursive, aReadDir, aWriteFile } from "../FileUtil"
import { logSystemInfo } from "../Log"
import { getEntities, getEntityMeta } from "../Meta"
import { getStore } from "../storage/MongoStore"
import { arrayToTrueObject } from "../Util"

/**
 * 
 * @param extensions 支持的扩展名列表，全小写，不要有开头的点
 */
async function aListUsingFiles(extensions: string[]) {
    const usingFiles: string[] = []

    const entities = getEntities()
    const entityNames = Object.keys(entities)
    for (const entityName of entityNames) {
        logSystemInfo("Analyze file for Entity: " + entityName)
        const entityMeta = entities[entityName]
        if (!entityMeta.fields) continue
        await aListUsingFilesOfEntity(entityMeta, usingFiles, extensions)
    }

    const len = usingFiles.length
    for (let i = 0; i < len; i++) {
        const f = usingFiles[i]
        if (f.indexOf("/r/") === 0) {
            usingFiles[i] = f.substring(3)
        }
    }

    return usingFiles
}

async function aListUsingFilesOfEntity(entityMeta: EntityMeta,
    usingFiles: string[], extensions: string[]) {

    const fileFields = mayContainFileFields(entityMeta)
    const fieldNames = Object.keys(fileFields)
    const projection = arrayToTrueObject(fieldNames) as {[k: string]: boolean}

    logSystemInfo("Analyze file fields: ", projection)

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    let tableName = entityMeta.tableName || entityMeta.name
    const tableNames = [tableName, tableName + "_history"]
    for (tableName of tableNames) {
        logSystemInfo("Analyze table " + tableName)
        const c = db.collection(tableName)
        const cursor = c.find({}, projection)
        // let i = 0
        while (await cursor.hasNext()) {
            const entity = await cursor.next()
            // console.log("entity num: " + ++i)
            extractFileFromEntity(entity, fieldNames, fileFields, usingFiles,
                extensions)
        }
    }
}

function extractFileFromEntity(entity: any, fieldNames: string[],
    fileFields: {[fieldName: string]: FieldMeta},
    usingFiles: string[], extensions: string[]) {

    for (const field of fieldNames) {
        const fieldMeta = fileFields[field]
        const v = _.get(entity, field)
        if (_.isNil(v)) continue
        if (_.isArray(v)) {
            for (const i of v) {
                extractFileFromValue(i, fieldMeta, usingFiles, extensions)
            }
        } else {
            extractFileFromValue(v, fieldMeta, usingFiles, extensions)
        }
    }
}

function extractFileFromValue(v: any, fieldMeta: FieldMeta, files: string[],
    extensions: string[]) {
    if (fieldMeta.type === "Object") {
        extractFilesFromJSON(v, extensions, files)
    } else if (fieldMeta.inputType === "RichText") {
        extractFilesFromHtml(v, files)
    } else {
        if (v.path) files.push(v.path)
    }
}

function extractFilesFromHtml(html: string, files: string[]) {
    const p = /src\s*=\s*["']([\w\-\/\.]+)["']/g
    let m = p.exec(html)
    while (m) {
        const f = m[1]
        if (f) files.push(f)
        m = p.exec(html)
    }
}

function extractFilesFromJSON(json: any, extensions: string[],
    files: string[]) {
    const jsonString = JSON.stringify(json)
    for (const ext of extensions) {
        const p = new RegExp(`["']([\\w-/]+.${ext})["']/ig`)
        let m = p.exec(jsonString)
        while (m) {
            const f = m[1]
            if (f) files.push(f)
            m = p.exec(jsonString)
        }
    }
}

// 可能包含文件的字段
// 对于组件，使用 "user.avatar" 之类的连点的形式
function mayContainFileFields(entityMeta: EntityMeta) {
    const fileFields: {[fieldName: string]: FieldMeta} = {}
    _mayContainFileFields(entityMeta, "", fileFields)
    return fileFields
}

function _mayContainFileFields(entityMeta: EntityMeta, fieldPrefix: string,
    fields: {[fieldName: string]: FieldMeta}) {
    const fieldNames = Object.keys(entityMeta.fields)
    for (const fieldName of fieldNames) {
        const fieldMeta = entityMeta.fields[fieldName]
        if (fieldMeta.type === "Image"
            || fieldMeta.type === "File"
            || fieldMeta.type === "Object"
            || fieldMeta.inputType === "RichText") {
                fields[fieldPrefix + fieldName] = fieldMeta
        } else if (fieldMeta.type === "Component" && fieldMeta.refEntity) {
            const refEntity = getEntityMeta(fieldMeta.refEntity)
            _mayContainFileFields(refEntity, `${fieldPrefix}${fieldName}.`
                , fields)
        }
    }
}

async function aListExistedFiles(cleanIncludeDirs: string[]) {
    const fileList: string[] = [] // 相对于 Config.fileDir 的文件路径列表
    for (const dir of cleanIncludeDirs) {
        await aListFilesRecursive(Config.fileDir, dir, fileList)
    }
    logSystemInfo("File list length: " + fileList.length)

    const extensions = new Set<string>()
    for (const file of fileList) {
        let ext = Path.extname(file)
        if (ext[0] === ".") ext = ext.substring(1)
        if (ext) extensions.add(ext.toLowerCase())
    }
    logSystemInfo("Ext: ", extensions)

    return {fileList, extensions: Array.from(extensions)}
}

export async function aAnalyzeFile(cleanIncludeDirs: string[]) {
    const existed = await aListExistedFiles(cleanIncludeDirs)

    let file = Path.join(Config.fileDir, "existed.txt")
    await aWriteFile(file, existed.fileList.join("\n"))

    file = Path.join(Config.fileDir, "extensions.txt")
    await aWriteFile(file, existed.extensions.join("\n"))

    const usingFiles = await aListUsingFiles(existed.extensions)
    file = Path.join(Config.fileDir, "using.txt")
    await aWriteFile(file, usingFiles.join("\n"))

    const existedFilesSet = new Set(existed.fileList)
    const usingFilesSet = new Set(usingFiles)

    const removable = existed.fileList.filter(x => !usingFilesSet.has(x))
    file = Path.join(Config.fileDir, "removable.txt")
    await aWriteFile(file, removable.join("\n"))

    const missing = usingFiles.filter(x => !existedFilesSet.has(x))
    file = Path.join(Config.fileDir, "missing.txt")
    await aWriteFile(file, missing.join("\n"))

    logSystemInfo("File analysis done.")
}
