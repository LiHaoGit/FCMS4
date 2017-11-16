const errors: {[k: string]: string} = {}

function define(code: string, message: string) {
    errors[code] = message
}

define("DupKey", "数据重复")
define("ConcurrentUpdate", "修改冲突")

define("NoSuchEntity", "操作对象不存在")

define("CreateNotAllow", "不允许创建")
define("EditNotAllow", "不允许编辑")
define("DeleteNotAllow", "不允许删除")

define("EmptyOperation", "空操作")

define("BadQueryCriteria", "查询条件 Criteria 错误")

define("SubAppNotExisted", "无此应用")

define("UserNotExisted", "无此用户")
define("UserDisabled", "被禁用用户")
define("PasswordNotMatch", "密码错误")

define("BadPasswordFormat", "密码格式不符合要求")

define("SecurityCodeNotMatch", "验证码错误")
define("SecurityCodeExpired", "验证码失效或过期")

define("CaptchaWrong", "图形验证码错误")

define("PayTranNotFound", "查无此交易")

define("PayTranStateChangeIllegal", "支付状态修改非法")

define("BadAmount", "金额错误")

export class MyError extends Error {
    private code: string

    constructor(code: string, message: string) {
        message = message || errors[code]
        super(message)
        this.code = code
        this.message = message
        this.stack = (new Error()).stack
    }

    describe() {
        return {code: this.code, message: this.message}
    }
}


export class UserError extends MyError {
    constructor(code: string, message: string) {
        super(code, message)
    }
}

export class UniqueConflictError extends UserError {
    constructor(code: string, message: string, private key: string) {
        super(code, message)
    }
}

export class SystemError extends MyError {
    constructor(code: string, message: string) {
        super(code, message)
    }
}

export class Error401 extends MyError {
    constructor(code: string, message: string) {
        super(code, message)
    }
}

export class Error403 extends MyError {
    constructor() {
        super("", "")
    }
}
