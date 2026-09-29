#!/usr/bin/env node
import { lstat, readdir, readlink, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const [sourceArg, shadowArg, ...changedArgs] = process.argv.slice(2);
if (!sourceArg || !shadowArg) {
  console.error("usage: shadow-snapshot.mjs SOURCE SHADOW_GIT_DIR [CHANGED_PATH ...]");
  process.exit(2);
}

const source = path.resolve(sourceArg);
const gitDir = path.resolve(shadowArg);
const indexFile = path.join(gitDir, "colab-index");
const env = { ...process.env, GIT_DIR: gitDir, GIT_INDEX_FILE: indexFile };

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: source,
    env,
    encoding: options.input instanceof Buffer ? null : "utf8",
    input: options.input,
    maxBuffer: 1024 * 1024 * 64,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "git command failed\n");
    process.exit(result.status ?? 1);
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : result.stdout;
}

async function ensureRepo() {
  const probe = spawnSync("git", ["--git-dir", gitDir, "rev-parse", "--is-bare-repository"], { encoding: "utf8" });
  if (probe.status !== 0) {
    const init = spawnSync("git", ["init", "--bare", gitDir], { encoding: "utf8" });
    if (init.status !== 0) throw new Error(init.stderr);
  }
}

async function walk(relative = "") {
  const absolute = path.join(source, relative);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) return [{ relative, stat, kind: "symlink" }];
  if (stat.isDirectory()) {
    const name = path.basename(relative);
    if (name === ".git") return [];
    const children = await readdir(absolute);
    const nested = await Promise.all(children.sort().map((child) => walk(path.join(relative, child))));
    return nested.flat();
  }
  if (stat.isFile()) return [{ relative, stat, kind: "file" }];
  return [];
}

await ensureRepo();

let entries;
if (changedArgs.length === 0) {
  await rm(indexFile, { force: true });
  entries = await walk("");
} else {
  entries = [];
  for (const changed of changedArgs) {
    const relative = path.normalize(changed).replace(/^\.\//, "");
    try {
      entries.push(...await walk(relative));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      git(["update-index", "--force-remove", "--", relative]);
    }
  }
}

const regular = entries.filter((entry) => entry.kind === "file");
const regularOids = regular.length === 0
  ? []
  : git(["hash-object", "-w", "--stdin-paths"], { input: regular.map((entry) => entry.relative).join("\n") + "\n" })
      .trim().split("\n");

const indexRecords = [];
for (let index = 0; index < regular.length; index += 1) {
  const entry = regular[index];
  const executable = (entry.stat.mode & 0o111) !== 0;
  indexRecords.push(`${executable ? "100755" : "100644"} ${regularOids[index]}\t${entry.relative}\0`);
}
for (const entry of entries.filter((candidate) => candidate.kind === "symlink")) {
  const target = await readlink(path.join(source, entry.relative));
  const oid = git(["hash-object", "-w", "--stdin"], { input: Buffer.from(target) }).trim();
  indexRecords.push(`120000 ${oid}\t${entry.relative}\0`);
}
if (indexRecords.length > 0) git(["update-index", "-z", "--index-info"], { input: indexRecords.join("") });

const rootOid = git(["write-tree"]).trim();
process.stdout.write(JSON.stringify({ root_oid: rootOid, updated_entries: entries.length }) + "\n");
