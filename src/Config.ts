function preprocess() {
    if (DEFAULT_CONFIG.sso && DEFAULT_CONFIG.subApps) {
        console.log("Preprocess config: sso & subApps")

        const ssoKey = Date.now().toString()

        const originConfigs: OriginConfig = {}

        for (const subApp of DEFAULT_CONFIG.subApps) {
            for (const origin of subApp.origins) {
                originConfigs[origin] = {
                    ssoServer: DEFAULT_CONFIG.sso,
                    defaultCallbackUrl: origin,
                    ssoKey
                }
            }
        }

        const ssoClients: {[origin: string]: SSOServerClient} = {}
        for (const subApp of DEFAULT_CONFIG.subApps) {
            for (const origin of subApp.origins) {
                ssoClients[origin] = {
                    acceptTokenUrl: origin + "/api/c/sso/client/token",
                    key: ssoKey
                }
            }
        }

        DEFAULT_CONFIG.originConfigs = originConfigs
        DEFAULT_CONFIG.ssoServer = {clients: ssoClients}
    }
}

const DEFAULT_CONFIG: IConfig = {
    metaFile: "",
    serverPort: 8090,
    serverSocketTimeout: 10 * 60 * 1000,
    cookieKey: "xxx",
    serverPugPath: "",
    uploadPath: "",
    httpBodyMaxFieldsSize: 6 * 1024 * 1024,
    fileDefaultMaxSize: 6 * 1024 * 1024,
    imageDefaultMaxSize: 2 * 1024 * 1024,
    sessionExpireAtServer: 1000 * 60 * 60 * 24 * 15, //  15 day
    usernameFields: ["username"],
    mongoDatabases: [{
        name: "main",
        url: "mongodb://localhost:27017/demo"
    }],
    redis: {},
    passwordFormat: /^([a-zA-Z0-9]){8,20}$/,
    fileDir: "",
    fileDownloadPrefix: "/r/",
    cluster: false,
    workerNum: 2,
    ssoServer: {clients: {}},
    originConfigs: {},
    logConfigs: {},
    errorCatcher: null,
    preprocess
}

export default DEFAULT_CONFIG
