// cSpell:words promisify

import * as bluebird from "bluebird"
import * as fs from "fs"
import * as mkdirp from "mkdirp"
import * as path from "path"
import { getLogger } from "./Log"

const pMakeDir = bluebird.promisify(mkdirp)

export const pUnlink = bluebird.promisify(fs.unlink)

const pRename = bluebird.promisify(fs.rename)

const pStat = bluebird.promisify(fs.stat)


export async function aMoveFileTo(oldName: string, newName: string) {
    const systemLogger = getLogger("system")

    const targetDir = path.dirname(newName)
    let stats
    try {
        stats = await pStat(targetDir)
    } catch (e) {
        systemLogger.error(e, "pStat")
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
