import WebSocket from "ws";

const socket = new WebSocket("ws://localhost:8787/channels/ch_demo/events", {
  headers: { "x-test-user-id": "alice" },
});

const timeout = setTimeout(() => {
  console.error("timeout waiting for item.changed");
  process.exit(1);
}, 5_000);

socket.on("open", async () => {
  const response = await fetch("http://localhost:8787/items/it_files/commit-root", {
    method: "POST",
    headers: { "x-test-user-id": "alice", "content-type": "application/json" },
    body: JSON.stringify({ previousRoot: "oid_2", nextRoot: "oid_3" }),
  });
  if (!response.ok) throw new Error(await response.text());
});

socket.on("message", (data) => {
  clearTimeout(timeout);
  console.log(data.toString());
  socket.close();
});
