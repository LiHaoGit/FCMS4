interface Extension {
    aSendSecurityCodeToEmail?: (toEmail: string, code: string) => void
    aSendSecurityCodeToPhone?: (toPhone: string, code: string) => void
    aKoaMiddlewareBeforeHandler?: () => void
}

export const extension: Extension = {}
