exports.serverPort = 7090
exports.cookieKey = ""
exports.serverPugPath = ""
exports.uploadPath = ""

const DEFAULT_CONFIG = {
    httpBodyMaxFieldsSize: 6 * 1024 * 1024,
    fileDefaultMaxSize: 6 * 1024 * 1024,
    imageDefaultMaxSize: 2 * 1024 * 1024,
    sessionExpireAtServer: 1000 * 60 * 60 * 24 * 15, //  15 day
    usernameFields: ["username"],
    mongoDatabases: [{
        name: "main",
        url: "mongodb://localhost:27017/demo"
    }],
    passwordFormat: /^([a-zA-Z0-9]){8,20}$/,
    fileDir: "",
    fileDownloadPrefix: "/r/",
    cluster: false,
    workerNum: 2
}

export default DEFAULT_CONFIG
