import { DurableObject } from "cloudflare:workers";

type Env = {
  DB: D1Database;
  OBJECTS: R2Bucket;
  INDEX_QUEUE: Queue<{ jobId: number; itemId: string; rootOid: string }>;
  CHANNEL_HUB: DurableObjectNamespace<ChannelHub>;
};

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

function actor(request: Request): string {
  // Validation-only identity seam. Production must replace this with a verified
  // application session/JWT and preserve the authorization checks below.
  const id = request.headers.get("x-test-user-id");
  if (!id) throw new Error("missing x-test-user-id");
  return id;
}

async function requireMember(env: Env, channelId: string, userId: string) {
  const row = await env.DB.prepare(
    "SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?",
  ).bind(channelId, userId).first<{ role: string }>();
  if (!row) throw new Error("forbidden");
  return row;
}

async function dispatchPending(env: Env) {
  const pending = await env.DB.prepare(
    "SELECT id, item_id, root_oid FROM sync_jobs WHERE state = 'pending' ORDER BY id LIMIT 100",
  ).all<{ id: number; item_id: string; root_oid: string }>();
  for (const job of pending.results) {
    await env.INDEX_QUEUE.send({ jobId: job.id, itemId: job.item_id, rootOid: job.root_oid });
  }
  return pending.results.length;
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "POST" && url.pathname === "/channels") {
    const userId = actor(request);
    const body = await request.json<{ id: string; name: string; displayName?: string }>();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO users(id, display_name) VALUES (?, ?)").bind(userId, body.displayName ?? userId),
      env.DB.prepare("INSERT INTO channels(id, name, created_by) VALUES (?, ?, ?)").bind(body.id, body.name, userId),
      env.DB.prepare("INSERT INTO channel_members(channel_id, user_id, role) VALUES (?, ?, 'owner')").bind(body.id, userId),
    ]);
    return json({ channelId: body.id }, 201);
  }

  if (request.method === "POST" && parts[0] === "channels" && parts[2] === "items") {
    const userId = actor(request);
    const channelId = parts[1];
    await requireMember(env, channelId, userId);
    const body = await request.json<{ id: string; type: "session" | "files" | "skill"; name: string }>();
    await env.DB.prepare("INSERT INTO shared_items(id, channel_id, owner_id, type, name) VALUES (?, ?, ?, ?, ?)")
      .bind(body.id, channelId, userId, body.type, body.name).run();
    return json({ itemId: body.id }, 201);
  }

  if (request.method === "PUT" && parts[0] === "objects" && parts[1]) {
    actor(request);
    await env.OBJECTS.put(parts[1], request.body, { httpMetadata: request.headers });
    return json({ oid: parts[1] }, 201);
  }

  if (request.method === "GET" && parts[0] === "objects" && parts[1]) {
    actor(request);
    const object = await env.OBJECTS.get(parts[1]);
    if (!object) return json({ error: "not found" }, 404);
    return new Response(object.body, { headers: { etag: object.httpEtag } });
  }

  if (request.method === "POST" && parts[0] === "items" && parts[2] === "commit-root") {
    const userId = actor(request);
    const itemId = parts[1];
    const body = await request.json<{ previousRoot: string | null; nextRoot: string }>();
    const item = await env.DB.prepare("SELECT channel_id, owner_id FROM shared_items WHERE id = ?")
      .bind(itemId).first<{ channel_id: string; owner_id: string }>();
    if (!item || item.owner_id !== userId) throw new Error("forbidden");
    const casSql = body.previousRoot === null
      ? "UPDATE shared_items SET root_oid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND root_oid IS NULL RETURNING root_oid"
      : "UPDATE shared_items SET root_oid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND root_oid = ? RETURNING root_oid";
    const cas = body.previousRoot === null
      ? env.DB.prepare(casSql).bind(body.nextRoot, itemId)
      : env.DB.prepare(casSql).bind(body.nextRoot, itemId, body.previousRoot);
    // RETURNING is the authoritative CAS result. D1's meta.changes includes
    // trigger side effects and is not reliable for deciding whether this row matched.
    const changed = await cas.first<{ root_oid: string }>();
    if (!changed) return json({ error: "root conflict" }, 409);
    const job = await env.DB.prepare("SELECT id FROM sync_jobs WHERE item_id = ? AND root_oid = ? ORDER BY id DESC LIMIT 1")
      .bind(itemId, body.nextRoot).first<{ id: number }>();
    if (!job) throw new Error("outbox job missing");
    await env.INDEX_QUEUE.send({ jobId: job.id, itemId, rootOid: body.nextRoot });
    await env.CHANNEL_HUB.getByName(item.channel_id).notify(JSON.stringify({ type: "item.changed", itemId, rootOid: body.nextRoot }));
    return json({ rootOid: body.nextRoot, jobId: job.id });
  }

  if (request.method === "GET" && parts[0] === "channels" && parts[2] === "events") {
    const userId = actor(request);
    await requireMember(env, parts[1], userId);
    return env.CHANNEL_HUB.getByName(parts[1]).fetch(request);
  }

  if (request.method === "GET" && url.pathname === "/validation/state") {
    actor(request);
    const items = await env.DB.prepare("SELECT id, root_oid FROM shared_items ORDER BY id").all();
    const jobs = await env.DB.prepare("SELECT id, item_id, root_oid, state FROM sync_jobs ORDER BY id").all();
    const indexed = await env.DB.prepare("SELECT item_id, root_oid FROM indexed_items ORDER BY item_id").all();
    return json({ items: items.results, jobs: jobs.results, indexed: indexed.results });
  }

  if (request.method === "POST" && url.pathname === "/internal/dispatch-pending") {
    actor(request);
    return json({ dispatched: await dispatchPending(env) });
  }

  return json({ error: "not found" }, 404);
}

export class ChannelHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") return json({ error: "websocket required" }, 426);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async notify(message: string) {
    for (const socket of this.ctx.getWebSockets()) socket.send(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const status = message === "forbidden" ? 403 : message.startsWith("missing") ? 401 : 500;
      return json({ error: message }, status);
    }
  },

  async queue(batch: MessageBatch<unknown>, env: Env) {
    for (const message of batch.messages) {
      const { jobId, itemId, rootOid } = message.body as { jobId: number; itemId: string; rootOid: string };
      const current = await env.DB.prepare("SELECT root_oid FROM shared_items WHERE id = ?").bind(itemId).first<{ root_oid: string | null }>();
      const statements = [];
      if (current?.root_oid === rootOid) {
        statements.push(env.DB.prepare("INSERT INTO indexed_items(item_id, root_oid) VALUES (?, ?) ON CONFLICT(item_id) DO UPDATE SET root_oid = excluded.root_oid, indexed_at = CURRENT_TIMESTAMP").bind(itemId, rootOid));
      }
      statements.push(env.DB.prepare("UPDATE sync_jobs SET state = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(current?.root_oid === rootOid ? "completed" : "stale", jobId));
      await env.DB.batch(statements);
      message.ack();
    }
  },

  async scheduled(_controller: ScheduledController, env: Env) {
    await dispatchPending(env);
  },
} satisfies ExportedHandler<Env>;
