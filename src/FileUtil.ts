// cSpell:words promisify

import * as bluebird from "bluebird"
import * as fs from "fs"
import * as mkdirp from "mkdirp"
import * as path from "path"
import { logSystemError } from "./Log"

const pMakeDir = bluebird.promisify(mkdirp)

export const pUnlink = bluebird.promisify(fs.unlink)

const pRename = bluebird.promisify(fs.rename)

const pStat = bluebird.promisify(fs.stat)

export async function aMoveFileTo(oldName: string, newName: string) {
    const targetDir = path.dirname(newName)
    let stats
    try {
        stats = await pStat(targetDir)
    } catch (e) {
        logSystemError(e, "pStat")
    }

    if (!(stats && stats.isDirectory()))
        await pMakeDir(targetDir)

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
