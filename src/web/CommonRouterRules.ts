// cSpell:words Captcha ckeditor

import Config from "../Config"
import { logSystemInfo } from "../Log"
import { actions as MetaActions } from "../Meta"
import { Router, RouteRuleRegisters } from "./Router"

import * as AdminHandler from "../handler/AdminHandler"
import * as CaptchaHandler from "../handler/CaptchaHandler"
import * as EntityHandler from "../handler/EntityHandler"
import * as MetaHandler from "../handler/MetaHandler"
import * as SecurityCodeHandler from "../handler/SecurityCodeHandler"
import * as SsoClientHandler from "../handler/SsoClientHandler"
import * as SsoServerHandler from "../handler/SsoServerHandler"
import * as UploadHandler from "../handler/UploadHandler"
import * as UserHandler from "../handler/UserHandler"


const actions = {
    ReadMeta: "读取元数据",
    WriteMeta: "修改元数据",
    ChangePhone: "修改绑定手机接口",
    ChangeEmail: "修改绑定邮箱接口",
    PreFilters: "管理预定义查询",
    Upload: "文件上传",
    RichTextUpload: "富文本编辑器文件上传",
    ES: "配置搜索引擎",
    Promotion: "推广活动",
    ViewCache: "查看缓存",
    ClearEntityCache: "清除实体缓存"
}

Object.assign(MetaActions, actions)

export function addCommonRouteRules(router: Router) {
    const rrr = new RouteRuleRegisters("/c", Config.errorCatcher, router)

    // ======================================
    // 元数据管理
    // ======================================

    rrr.get("/meta", {action: "ReadMeta"}, MetaHandler.aGetAllMeta)
    rrr.get("/meta-empty", {action: "WriteMeta"},
        MetaHandler.aGetEmptyEntityMeta)
    rrr.get("/meta/:type/:name", {action: "ReadMeta"}, MetaHandler.aGetMeta)
    rrr.put("/meta/:type/:name", {action: "WriteMeta"}, MetaHandler.aSaveMeta)
    rrr.post("/meta", {action: "WriteMeta"}, MetaHandler.aImportMeta)
    rrr.del("/meta/:type/:name", {action: "WriteMeta"},
        MetaHandler.aRemoveMeta)

    rrr.get("/meta/actions", {action: "WriteMeta"}, MetaHandler.aGetActions)

    // ======================================
    // 用户
    // ======================================

    rrr.get("/ping", {auth: true}, UserHandler.aPing)
    rrr.post("/sign-in", {}, UserHandler.aSignIn)
    rrr.post("/sign-out", {auth: true}, UserHandler.aSignOut)
    rrr.post("/change-password", {auth: true},
        UserHandler.aChangePassword)
    // rrr.post('/reset-password', {}, UserHandler.aResetPassword)
    // rrr.post('/change-phone', {action: 'ChangePhone'},
    //     UserHandler.aChangePhone)
    // rrr.post('/change-email', {action: 'ChangeEmail'},
    //     UserHandler.aChangeEmail)

    if (Config.ssoServer) {
        rrr.get("/sso/auth", {}, SsoServerHandler.aAuth)
        rrr.post("/sso/sign-in", {}, SsoServerHandler.aSignIn)
        rrr.post("/sso/validate-token", {}, SsoServerHandler.aValidateToken)
        rrr.get("/sso/sign-out", {}, SsoServerHandler.aSignOut)

        rrr.get("/sso/client/token", {}, SsoClientHandler.aAcceptToken)
        rrr.get("/sso/client/sign-out", {}, SsoClientHandler.aSignOut)
    } else {
        logSystemInfo("Not use SSO")
    }

    // ======================================
    // 安全
    // ======================================

    // 发送注册验证码到手机和邮箱
    rrr.post("/security-code/phone/:phone", {},
        SecurityCodeHandler.aSendSignUpCodeToPhone)
    rrr.post("/security-code/email/:email", {},
        SecurityCodeHandler.aSendSignUpCodeToEmail)

    // 请求一个图形验证码
    rrr.get("/captcha", {}, CaptchaHandler.aGenerate)

    // ======================================
    // 实体 CRUD
    // ======================================

    rrr.get("/entity/:entityName", {authEntity: "listEntity"},
        EntityHandler.aListH)
    rrr.get("/entity/:entityName/:id", {authEntity: "getEntity"},
        EntityHandler.aFindOneById)
    rrr.post("/entity/:entityName", {authEntity: "createEntity"},
        EntityHandler.aCreateEntity)
    rrr.post("/entity/:entityName/batch", {authEntity: "createEntity"},
        EntityHandler.aCreateEntitiesInBatch)
    rrr.put("/entity/:entityName/:id", {authEntity: "updateOneEntity"},
        EntityHandler.aUpdateEntityById)
    rrr.put("/entity/:entityName", {authEntity: "updateManyEntity"},
        EntityHandler.aUpdateEntityInBatch)
    rrr.del("/entity/:entityName", {authEntity: "removeEntity"},
        EntityHandler.aDeleteEntityInBatch)

    rrr.put("/entity/filters", {action: "PreFilters"},
        EntityHandler.aSaveFilters)
    rrr.del("/entity/filters", {action: "PreFilters"},
        EntityHandler.aRemoveFilters)

    rrr.del("/cache", {action: "ClearEntityCache"},
        EntityHandler.aClearCache)

    rrr.get("/history/list/:entityName/:id", {authEntity: "getEntity"},
        EntityHandler.aListHistoryH)
    rrr.get("/history/get/:entityName/:id", {authEntity: "getEntity"},
        EntityHandler.aGetHistoryItemH)

    // ======================================
    // 文件
    // ======================================

    rrr.post("/file", {action: "Upload"}, UploadHandler.aUpload) // h5
    rrr.post("/file2", {action: "Upload"},
        UploadHandler.aUpload2) // transport
    rrr.post("/rich-text-file", {action: "RichTextUpload"},
        UploadHandler.aUploadForRichText)
    rrr.post("/ckeditor-file", {action: "RichTextUpload"},
        UploadHandler.aUploadForCkEditor)
    rrr.post("/ckeditor-image", {action: "RichTextUpload"},
        UploadHandler.aUploadImageForCkEditor)

    // ======================================
    // 搜索引擎
    // ======================================
    //
    // let ESController = require('../handler/ElasticSearchController')
    // rrr.post('/config-es', {action: 'ES'}, ESController.aConfig)

    // ======================================
    // ADMIN
    // ======================================
    rrr.post("/admin/analyze-file", {admin: true},
        AdminHandler.aHandleAnalyzeFile)
}
