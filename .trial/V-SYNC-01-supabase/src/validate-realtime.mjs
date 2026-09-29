import { createClient } from "@supabase/supabase-js";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxy = process.env.HTTPS_PROXY;
if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));
const wsAgent = proxy ? new HttpsProxyAgent(proxy) : undefined;

class ProxyWebSocket extends WebSocket {
  constructor(address, protocols, options = {}) {
    super(address, protocols, { ...options, agent: wsAgent });
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } },
  realtime: { transport: ProxyWebSocket },
  auth: { persistSession: false, autoRefreshToken: false },
});
await supabase.realtime.setAuth(process.env.SUPABASE_ACCESS_TOKEN);

const result = await new Promise((resolve, reject) => {
  const statuses = [];
  const timeout = setTimeout(() => reject(new Error(`Realtime event timeout; statuses=${statuses.join(",")}`)), 20_000);
  const channel = supabase.channel("colab-validation")
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "channel_shares",
      filter: `id=eq.${process.env.SHARE_ID}`,
    }, async (payload) => {
      clearTimeout(timeout);
      await supabase.removeChannel(channel);
      resolve(payload);
    })
    .subscribe(async (status) => {
      statuses.push(status);
      if (status !== "SUBSCRIBED") return;
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/commit_share_root`, {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          target_share_id: process.env.SHARE_ID,
          base_root_oid: process.env.CURRENT_ROOT,
          target_root_oid: process.env.NEXT_ROOT ?? "e".repeat(40),
        }),
      });
      if (!response.ok) reject(new Error(await response.text()));
    });
});

console.log(JSON.stringify({ result: "PASS", eventType: result.eventType, rootOid: result.new.current_root_oid }, null, 2));
