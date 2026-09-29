import { ProxyAgent, setGlobalDispatcher } from "undici";
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));

const all = Array.from({ length: 100_000 }, (_, index) => index.toString(16).padStart(40, "0"));
const headers = {
  apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
  authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
  "content-type": "application/json",
};
const started = performance.now();
let missing = 0;
let requests = 0;
for (let offset = 0; offset < all.length; offset += 1_000) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/missing_git_objects`, {
    method: "POST", headers, body: JSON.stringify({ target_share_id: process.env.SHARE_ID, candidate_oids: all.slice(offset, offset + 1_000) }),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  missing += (await response.json()).length;
  requests++;
}
console.log(JSON.stringify({ result: "PASS", candidates: all.length, batchSize: 1_000, requests, missing, elapsedMs: Math.round(performance.now() - started) }, null, 2));
