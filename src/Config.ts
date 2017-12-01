const originConfigs: {[origin: string]: any} = {}

const clients: any = {}

const DEFAULT_CONFIG = {
    metaFile: "",
    serverPort: 8090,
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
    ssoServer: {clients},
    originConfigs,
    logConfigs: {},
    errorCatcher: null
}

export default DEFAULT_CONFIG
