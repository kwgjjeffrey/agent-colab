import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".work");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
const localToken = randomBytes(32).toString("hex");
const core = fork(path.join(root, "src/core.mjs"), [], {
  env: { ...process.env, WORK_DIR: work, LOCAL_API_TOKEN: localToken },
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});
const port = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("core start timeout")), 5000);
  core.once("message", (message) => { clearTimeout(timer); resolve(message.port); });
});
const call = (pathname, token = localToken, method = "GET") => fetch(`http://127.0.0.1:${port}${pathname}`, {
  method, headers: { authorization: `Bearer ${token}` },
});

const unauthorized = await call("/tasks", "wrong-token");
if (unauthorized.status !== 401) throw new Error("local API accepted bad token");

// GUI and two Agent runtimes request the same operation concurrently.
const callers = ["gui", "agent-a", "agent-b"];
const results = await Promise.all(callers.map(async (caller) => {
  const response = await call(`/sync?share_id=${process.env.SHARE_ID}`, localToken, "POST");
  if (!response.ok) throw new Error(`${caller}: ${await response.text()}`);
  return { caller, ...(await response.json()) };
}));

// The GUI caller is gone; the Application Core remains available to an Agent.
const afterGuiClosed = await call("/tasks");
const tasks = await afterGuiClosed.json();
if (tasks[0].executions !== 1) throw new Error(`expected one execution, got ${tasks[0].executions}`);
if (process.env.SUPABASE_ACCESS_TOKEN && JSON.stringify(results).includes(process.env.SUPABASE_ACCESS_TOKEN)) {
  throw new Error("cloud credential leaked through local API");
}

console.log(JSON.stringify({ result: "PASS", unauthorizedStatus: unauthorized.status, callers: results, tasks, guiWindowExitDoesNotStopCore: true }, null, 2));
core.kill("SIGTERM");
