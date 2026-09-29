import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ProxyAgent, setGlobalDispatcher } from "undici";

if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
mkdirSync(process.env.WORK_DIR, { recursive: true });
const db = new DatabaseSync(path.join(process.env.WORK_DIR, "client.sqlite"));
db.exec(`
  create table if not exists sync_tasks(
    share_id text primary key,
    state text not null,
    root_oid text,
    executions integer not null default 0,
    updated_at text not null default current_timestamp
  )
`);
const inFlight = new Map();

async function executeSync(shareId) {
  db.prepare(`insert into sync_tasks(share_id,state,executions) values (?, 'running', 1)
    on conflict(share_id) do update set state='running', executions=executions+1, updated_at=current_timestamp`).run(shareId);
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/channel_shares?id=eq.${shareId}&select=id,current_root_oid`, {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  });
  if (!response.ok) throw new Error(await response.text());
  const [share] = await response.json();
  await new Promise((resolve) => setTimeout(resolve, 250));
  db.prepare("update sync_tasks set state='done', root_oid=?, updated_at=current_timestamp where share_id=?").run(share.current_root_oid, shareId);
  return { shareId, rootOid: share.current_root_oid };
}

function sync(shareId) {
  if (!inFlight.has(shareId)) {
    const promise = executeSync(shareId).finally(() => inFlight.delete(shareId));
    inFlight.set(shareId, promise);
  }
  return inFlight.get(shareId);
}

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.headers.authorization !== `Bearer ${process.env.LOCAL_API_TOKEN}`) {
    response.statusCode = 401; response.end(JSON.stringify({ error: "unauthorized" })); return;
  }
  const url = new URL(request.url, "http://127.0.0.1");
  try {
    if (request.method === "POST" && url.pathname === "/sync") {
      response.end(JSON.stringify(await sync(url.searchParams.get("share_id")))); return;
    }
    if (request.method === "GET" && url.pathname === "/tasks") {
      response.end(JSON.stringify(db.prepare("select * from sync_tasks order by share_id").all())); return;
    }
    response.statusCode = 404; response.end(JSON.stringify({ error: "not found" }));
  } catch (error) {
    response.statusCode = 500; response.end(JSON.stringify({ error: String(error) }));
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.send?.({ type: "ready", port: address.port });
});

process.on("SIGTERM", () => server.close(() => { db.close(); process.exit(0); }));
