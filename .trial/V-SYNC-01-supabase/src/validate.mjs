import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const work = path.join(root, ".work");
const source = path.join(work, "source");
const producerGit = path.join(work, "producer.git");
const consumerGit = path.join(work, "consumer.git");
const materialized = path.join(work, "materialized");

const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ACCESS_TOKEN", "CHANNEL_ID", "SHARE_ID"];
for (const key of required) if (!process.env[key]) throw new Error(`missing ${key}`);
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));

const apiHeaders = {
  apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
  authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
};

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

async function request(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...apiHeaders, ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`${response.status} ${url}: ${await response.text()}`);
  return response;
}

async function buildRoot() {
  await rm(work, { recursive: true, force: true });
  await mkdir(path.join(source, "docs"), { recursive: true });
  await writeFile(path.join(source, "README.md"), "colab sync validation\n");
  await writeFile(path.join(source, "docs", "design.md"), "first snapshot\n");
  git(["init", "--bare", producerGit]);
  const index = path.join(work, "producer.index");
  const env = { ...process.env, GIT_DIR: producerGit, GIT_WORK_TREE: source, GIT_INDEX_FILE: index };
  git(["add", "-A"], { env });
  return { rootOid: git(["write-tree"], { env }), index, env };
}

function objectOids(gitDir) {
  return git(["--git-dir", gitDir, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)"])
    .split("\n").filter(Boolean);
}

function objectFile(gitDir, oid) {
  return path.join(gitDir, "objects", oid.slice(0, 2), oid.slice(2));
}

async function missing(oids) {
  const response = await request(`${process.env.SUPABASE_URL}/rest/v1/rpc/missing_git_objects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_share_id: process.env.SHARE_ID, candidate_oids: oids }),
  });
  return response.json();
}

async function uploadObjects(oids) {
  const records = [];
  for (const oid of oids) {
    const bytes = await readFile(objectFile(producerGit, oid));
    const storagePath = `${process.env.CHANNEL_ID}/${process.env.SHARE_ID}/${oid}`;
    await request(`${process.env.SUPABASE_URL}/storage/v1/object/git-objects/${storagePath}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: bytes,
    });
    records.push({ oid, storage_path: storagePath, size: bytes.length });
  }
  await request(`${process.env.SUPABASE_URL}/rest/v1/rpc/register_git_objects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_share_id: process.env.SHARE_ID, objects: records }),
  });
  return records;
}

async function commitRoot(baseRoot, targetRoot) {
  const response = await request(`${process.env.SUPABASE_URL}/rest/v1/rpc/commit_share_root`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_share_id: process.env.SHARE_ID, base_root_oid: baseRoot, target_root_oid: targetRoot }),
  });
  return response.json();
}

async function downloadObject(oid) {
  const target = objectFile(consumerGit, oid);
  try { await stat(target); return false; } catch {}
  const response = await request(`${process.env.SUPABASE_URL}/storage/v1/object/authenticated/git-objects/${process.env.CHANNEL_ID}/${process.env.SHARE_ID}/${oid}`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, new Uint8Array(await response.arrayBuffer()));
  const actual = git(["--git-dir", consumerGit, "cat-file", "-e", oid]);
  if (actual !== "") throw new Error(`unexpected git verification output: ${actual}`);
  return true;
}

async function materialize(rootOid) {
  git(["init", "--bare", consumerGit]);
  const queue = [{ oid: rootOid, type: "tree" }];
  let downloaded = 0;
  while (queue.length) {
    const current = queue.pop();
    if (await downloadObject(current.oid)) downloaded++;
    if (current.type !== "tree") continue;
    const listing = git(["--git-dir", consumerGit, "ls-tree", "-z", current.oid]);
    for (const entry of listing.split("\0").filter(Boolean)) {
      const match = entry.match(/^\d+ (blob|tree) ([0-9a-f]+)\t/);
      if (!match) throw new Error(`cannot parse tree entry: ${entry}`);
      queue.push({ type: match[1], oid: match[2] });
    }
  }
  await rm(materialized, { recursive: true, force: true });
  await mkdir(materialized, { recursive: true });
  const index = path.join(work, "consumer.index");
  const env = { ...process.env, GIT_DIR: consumerGit, GIT_WORK_TREE: materialized, GIT_INDEX_FILE: index };
  git(["read-tree", rootOid], { env });
  git(["checkout-index", "-a", "-f"], { env });
  return downloaded;
}

async function digestTree(directory) {
  const hash = createHash("sha256");
  async function visit(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const full = path.join(dir, name);
      const info = await stat(full);
      const relative = path.relative(directory, full);
      if (info.isDirectory()) await visit(full);
      else { hash.update(relative); hash.update("\0"); hash.update(await readFile(full)); }
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

const started = performance.now();
const first = await buildRoot();
const firstObjects = objectOids(producerGit);
const firstMissing = await missing(firstObjects);
await uploadObjects(firstMissing);
await commitRoot(null, first.rootOid);
const firstDownloaded = await materialize(first.rootOid);
if (await digestTree(source) !== await digestTree(materialized)) throw new Error("first materialization differs");

await writeFile(path.join(source, "docs", "design.md"), "second snapshot\n");
await writeFile(path.join(source, "new.txt"), "increment only\n");
git(["add", "-A"], { env: first.env });
const secondRoot = git(["write-tree"], { env: first.env });
const secondObjects = objectOids(producerGit);
const secondMissing = await missing(secondObjects);
await uploadObjects(secondMissing);
await commitRoot(first.rootOid, secondRoot);
const secondDownloaded = await materialize(secondRoot);
if (await digestTree(source) !== await digestTree(materialized)) throw new Error("second materialization differs");

let conflict = false;
try { await commitRoot(first.rootOid, "f".repeat(40)); } catch (error) { conflict = String(error).includes("400"); }
if (!conflict) throw new Error("stale root did not conflict");

console.log(JSON.stringify({
  result: "PASS",
  first: { rootOid: first.rootOid, objects: firstObjects.length, missing: firstMissing.length, downloaded: firstDownloaded },
  second: { rootOid: secondRoot, objects: secondObjects.length, missing: secondMissing.length, downloaded: secondDownloaded },
  staleRootConflict: conflict,
  elapsedMs: Math.round(performance.now() - started),
}, null, 2));
