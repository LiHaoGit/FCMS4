import _ = require("lodash")
import mongodb = require("mongodb")
import Path = require("path")

import Config from "../Config"
import { aListFilesRecursive, aReadDir, aWriteFile } from "../FileUtil"
import { logSystemDebug, logSystemInfo } from "../Log"
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

    const fileFieldNames = mayContainFileFields(entityMeta)
    const projection = arrayToTrueObject(fileFieldNames) || {}

    logSystemInfo("Analyze file fields: ", entityMeta.name, fileFieldNames)

    const db = await getStore(entityMeta.dbName || "main").aDatabase()
    let tableName = entityMeta.tableName || entityMeta.name
    const tableNames = [tableName, tableName + "_history"]
    for (tableName of tableNames) {
        logSystemInfo("Analyze table " + tableName)
        const c = db.collection(tableName)
        const cursor = c.find({}, {fields: projection})
        // let i = 0
        while (await cursor.hasNext()) {
            const entity = await cursor.next()
            // console.log("entity num: " + ++i)
            extractFileFromEntity(entity, entityMeta, usingFiles, extensions)
        }
    }
}

function extractFileFromEntity(entity: any, entityMeta: EntityMeta,
    usingFiles: string[], extensions: string[]) {

    const fieldNames = Object.keys(entityMeta.fields)
    for (const field of fieldNames) {
        const fieldMeta = entityMeta.fields[field]
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
    } else if (fieldMeta.type === "Component") {
        if (!fieldMeta.refEntity || !v) return
        logSystemInfo("Analyze Component", fieldMeta.refEntity)
        const refEntityMeta = getEntityMeta(fieldMeta.refEntity)
        extractFileFromEntity(v, refEntityMeta, files, extensions)
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
    // logSystemDebug("json: ", jsonString)

    for (const ext of extensions) {
        const p = new RegExp(`["']([\\w\\-\\/]+.${ext})["']`, "ig")
        let m = p.exec(jsonString)
        while (m) {
            const f = m[1]
            if (f) {
                files.push(f)
                logSystemDebug("Find file in object", f)
            }
            m = p.exec(jsonString)
        }
    }
}

// 可能包含文件的字段
function mayContainFileFields(entityMeta: EntityMeta) {
    const fieldNames = Object.keys(entityMeta.fields)
    const fileFieldNames: string[] = []
    for (const fieldName of fieldNames) {
        const fieldMeta = entityMeta.fields[fieldName]
        if (fieldMeta.type === "Image"
            || fieldMeta.type === "File"
            || fieldMeta.type === "Object"
            || fieldMeta.inputType === "RichText") {
                fileFieldNames.push(fieldName)
        } else if (fieldMeta.type === "Component" && fieldMeta.refEntity) {
            fileFieldNames.push(fieldName)
        }
    }
    return fileFieldNames
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
    const usingFilesSet = new Set(usingFiles)

    file = Path.join(Config.fileDir, "using.txt")
    await aWriteFile(file, [...usingFilesSet].join("\n"))

    const existedFilesSet = new Set(existed.fileList)

    const removable = existed.fileList.filter(x => !usingFilesSet.has(x))
    file = Path.join(Config.fileDir, "removable.txt")
    await aWriteFile(file, removable.join("\n"))

    const missing = usingFiles.filter(x => !existedFilesSet.has(x))
    file = Path.join(Config.fileDir, "missing.txt")
    await aWriteFile(file, missing.join("\n"))

    logSystemInfo("File analysis done.")
}
