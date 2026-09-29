#!/usr/bin/env node
import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const trial = await mkdtemp(path.join(tmpdir(), "colab-shadow-bench-"));
const script = path.resolve("shadow-snapshot.mjs");

function snapshot(source, shadow, changed = []) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [script, source, shadow, ...changed], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return { elapsed_ms: Math.round(performance.now() - started), ...JSON.parse(result.stdout) };
}

try {
  const many = path.join(trial, "many");
  const manyShadow = path.join(trial, "many.git");
  await mkdir(many);
  const fileCount = 100_000;
  const batchSize = 1000;
  for (let base = 0; base < fileCount; base += batchSize) {
    await Promise.all(Array.from({ length: batchSize }, (_, offset) => {
      const index = base + offset;
      return writeFile(path.join(many, `f-${String(index).padStart(6, "0")}.txt`), `value-${index}\n`);
    }));
  }
  const manyInitial = snapshot(many, manyShadow);
  await appendFile(path.join(many, "f-050000.txt"), "changed\n");
  const manyIncremental = snapshot(many, manyShadow, ["f-050000.txt"]);

  const session = path.join(trial, "session");
  const sessionShadow = path.join(trial, "session.git");
  await mkdir(session);
  const sessionPath = path.join(session, "session.jsonl");
  await writeFile(sessionPath, Buffer.alloc(100 * 1024 * 1024, 0x61));
  const sessionInitial = snapshot(session, sessionShadow);
  await appendFile(sessionPath, Buffer.alloc(1024 * 1024, 0x62));
  const sessionIncremental = snapshot(session, sessionShadow, ["session.jsonl"]);
  const listing = spawnSync("git", ["--git-dir", sessionShadow, "ls-tree", sessionIncremental.root_oid, "session.jsonl"], { encoding: "utf8" });
  const blobOid = listing.stdout.trim().split(/\s+/)[2];
  const size = spawnSync("git", ["--git-dir", sessionShadow, "cat-file", "-s", blobOid], { encoding: "utf8" });

  console.log(JSON.stringify({
    small_files: { count: fileCount, initial: manyInitial, one_file_incremental: manyIncremental },
    append_session: {
      initial_bytes: 100 * 1024 * 1024,
      appended_bytes: 1024 * 1024,
      initial: sessionInitial,
      incremental: sessionIncremental,
      new_blob_logical_bytes: Number(size.stdout.trim()),
    },
  }, null, 2));
} finally {
  await rm(trial, { recursive: true, force: true });
}
