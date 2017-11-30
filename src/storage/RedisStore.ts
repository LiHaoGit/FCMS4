import * as redis from "redis"
import { logSystemError, logSystemInfo } from "../Log"

type AsyncMessageHandler = (message: string) => Promise<any>

const subscribers: {[k: string]: AsyncMessageHandler[]} = {}

let client: AsyncRedisClient
let subscriberClient: AsyncRedisClient

export async function aInit() {
    client = new AsyncRedisClient()

    client.client.on("error", error => logSystemError(error, "init redis"))
    client.client.on("ready", () => logSystemInfo("Redis ready"))
    client.client.on("connect", () => logSystemInfo("Redis connect"))

    subscriberClient = new AsyncRedisClient()
    subscriberClient.client.on("subscribe",
        () => logSystemInfo("Redis subscribe"))

    subscriberClient.client.on("message", (channel, message) => {
        logSystemInfo("ON REDIS MESSAGE", channel, message)
        const asyncHandlers = subscribers[channel]
        if (asyncHandlers)
            for (const asyncHandler of asyncHandlers)
                asyncHandler(message)
                    .catch(e => logSystemError(e, "handle message"))
    })

    await subscriberClient.subscribeAsync("test", "MetaChange")

    await aPublish("test", "hello")
}

export async function aDispose() {
    if (client) client.client.quit()
    if (subscriberClient) await subscriberClient.unsubscribeAsync("MetaChange")
    subscriberClient.client.quit()
}

export function getMainClient() {
    return client
}

export function subscribe(channel: string, asyncHandler: AsyncMessageHandler) {
    subscribers[channel] = subscribers[channel] || []
    subscribers[channel].push(asyncHandler)
}

export async function aPublish(channel: string, message: string) {
    if (client) await client.publishAsync(channel, message)
}

class AsyncRedisClient {
    client: redis.RedisClient

    constructor() {
        this.client = redis.createClient() // TODO redis config
    }

    subscribeAsync(args1: string, args2: string) {
        return new Promise((resolve, reject) => {
            this.client.subscribe(args1, args2, e => {
                if (e)
                    reject(e)
                else
                    resolve(true)
            })
        })
    }

    unsubscribeAsync(args: string) {
        return new Promise((resolve, reject) => {
            this.client.unsubscribe(args, e => {
                if (e)
                    reject(e)
                else
                    resolve(true)
            })
        })
    }

    publishAsync(channel: string, message: string) {
        return new Promise((resolve, reject) => {
            this.client.publish(channel, message, e => {
                if (e)
                    reject(e)
                else
                    resolve(true)
            })
        })
    }

    getAsync(key: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            this.client.get(key, (e, value: string) => {
                if (e)
                    reject(e)
                else
                    resolve(value)
            })
        })
    }

    setAsync(key: string, value: string) {
        return new Promise((resolve, reject) => {
            this.client.set(key, value, e => {
                if (e)
                    reject(e)
                else
                    resolve(true)
            })
        })
    }

    keysAsync(key: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.client.keys(key, (e, keys) => {
                if (e)
                    reject(e)
                else
                    resolve(keys)
            })
        })
    }

    delAsync(key: string) {
        return new Promise((resolve, reject) => {
            this.client.del(key, e => {
                if (e)
                    reject(e)
                else
                    resolve(true)
            })
        })
    }

    mDelAsync(keys: string[]) {
        return Promise.all(keys.map(key => this.delAsync(key)))
    }
}
