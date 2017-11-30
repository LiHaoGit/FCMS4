import cluster = require("cluster")
import Config from "./Config"

export function use(f: () => void) {
    if (!Config.cluster)
        f()
    else {
        const workerNum = Config.workerNum

        if (cluster.isMaster) {
            console.log(`Master ${process.pid} is running`)

            cluster.on("exit", worker => {
                console.log(`worker ${worker.process.pid} died`)
            })

            for (let i = 0; i < workerNum; i++) {
                cluster.fork()
            }
        } else {
            console.log(`Start Worker ${process.pid} started`)
            f()
        }
    }
}
