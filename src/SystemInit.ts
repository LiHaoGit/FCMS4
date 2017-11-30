import { logSystemInfo } from "./Log"
import { hashPassword, newObjectId } from "./Meta"
import { aCreate, aFindOneByCriteria } from "./service/EntityService"

export async function aInit() {
    await aCreateAdminUser()
    await aAddDefaultMenu()
}

async function aCreateAdminUser() {
    const hasAdmin = await aFindOneByCriteria({}, "F_User", {admin: true})
    if (hasAdmin) return

    logSystemInfo("Create default admin user")
    return aCreate({}, "F_User", {
        _id: newObjectId().toString(),
        admin: true,
        username: "admin",
        password: hashPassword("admin")
    })
}

async function aAddDefaultMenu() {
    const hasMenu = await aFindOneByCriteria({}, "F_Menu", {})
    if (hasMenu) return

    await aCreate({}, "F_Menu", defaultMenu)
}

const defaultMenu = {
    _version: 1,
    menuGroups: [{
        label: null,
        menuItems: [{label: "用户", toEntity: "F_User", callFunc: null},
            {label: "Meta", toEntity: null, callFunc: "F.toMetaIndex"}]
    }]
}
