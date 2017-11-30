import * as koa from "koa"
import { actions, aRemoveEntityMeta, aSaveEntityMeta,
    DB, getEntities, getMetaForFront } from "../Meta"
import { patchSystemFields } from "../SystemMeta"

export async function aGetAllMeta(ctx: koa.Context) {
    ctx.body = getMetaForFront()
}

export async function aGetMeta(ctx: koa.Context) {
    const params = ctx.state.params
    const type = params.type
    const name = params.name

    if (type === "entity")
        ctx.body = getEntities()[name]
    else
        ctx.status = 400
}

export async function aSaveMeta(ctx: koa.Context) {
    const params = ctx.state.params

    const type = params.type
    const name = params.name
    const meta = ctx.request.body

    if (type === "entity") {
        await aSaveEntityMeta(name, meta)
        ctx.status = 204
    } else {
        ctx.status = 400
    }
}

export async function aImportMeta(ctx: koa.Context) {
    const meta = ctx.request.body

    for (const e of meta.entities) {
        delete e._id
        await aSaveEntityMeta(e.name, e)
    }

    ctx.status = 204
}

export async function aRemoveMeta(ctx: koa.Context) {
    const params = ctx.state.params

    const type = params.type
    const name = params.name

    if (type === "entity") {
        await aRemoveEntityMeta(name)
        ctx.status = 204
    } else {
        ctx.status = 400
    }
}

export async function aGetEmptyEntityMeta(ctx: koa.Context) {
    const e = {name: "", label: "", fields: {}, db: DB.mongo}
    patchSystemFields(e)
    ctx.body = e
}

export async function aGetActions(ctx: koa.Context) {
    ctx.body = actions
}
