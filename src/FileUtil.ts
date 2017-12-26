// cSpell:words promisify

import bluebird = require("bluebird")
import fs = require("fs")
import mkdirp = require("mkdirp")
import Path = require("path")
import { logSystemError } from "./Log"

const pRename = bluebird.promisify(fs.rename)

const pStat = bluebird.promisify(fs.stat)

export async function aReadDir(path: string) {
    return new Promise<string[]>((resolve, reject) => {
        fs.readdir(path, function(err, files) {
            if (err) {
                reject(err)
                return
            }
            resolve(files)
        })
    })
}

// 返回的路径列表相对于 pathPrefix
export async function aListFilesRecursive(pathPrefix: string, dirPath: string,
    fileList: string[]) {

    const fullDirPath = Path.join(pathPrefix, dirPath)
    const files = await aReadDir(fullDirPath)
    for (const file of files) {
        const filePath = Path.join(dirPath, file)
        const fileFullPath = Path.join(pathPrefix, filePath)
        const isDir = await aIsDir(fileFullPath)
        if (isDir) {
            await aListFilesRecursive(pathPrefix, filePath, fileList)
        } else {
            fileList.push(filePath)
        }
    }

}

export async function aRemoveFile(file: string) {
    return new Promise<boolean>((resolve, reject) => {
        fs.unlink(file, err => {
            if (err) {
                reject(err)
                return
            }
            resolve(true)
        })
    })
}

export async function aMakeDirRecursive(dirPath: string) {
    return new Promise<boolean>((resolve, reject) => {
        mkdirp(dirPath, err => {
            if (err) {
                reject(err)
                return
            }
            resolve(true)
        })
    })
}

export async function aMoveFileTo(oldName: string, newName: string) {
    const targetDir = Path.dirname(newName)
    let stats
    try {
        stats = await pStat(targetDir)
    } catch (e) {
        logSystemError(e, "pStat")
    }

    if (!(stats && stats.isDirectory()))
        await aMakeDirRecursive(targetDir)

    await pRename(oldName, newName)
}
export async function aFileExists(fileFullPath: string) {
    try {
        await pStat(fileFullPath)
        return true
    } catch (e) {
        if (e.code === "ENOENT") return false
        throw e
    }
}

export async function aIsDir(fileFullPath: string) {
    try {
        const stat = await pStat(fileFullPath)
        return stat.isDirectory()
    } catch (e) {
        if (e.code === "ENOENT") return false
        throw e
    }
}

export async function aReadJSON(file: string) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, {encoding: "UTF-8"}, (err, text) => {
            if (err) {
                reject(err)
                return
            }
            const json = text ? JSON.parse(text) : null
            resolve(json)
        })
    })
}

export async function aWriteJSON(file: string, obj: any) {
    const str = JSON.stringify(obj, null, 4)
    return aWriteFile(file, str)
}

export async function aWriteFile(file: string, str: string) {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, str, (err => {
            if (err) {
                reject(err)
                return
            }
            resolve(true)
        }))
    })
}
