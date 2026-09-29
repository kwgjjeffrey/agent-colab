# Session Reader response

`colab-session-reader read` resolves a readable Session reference, asks Local Core to synchronize and materialize its current raw snapshot, then projects provider records into a common read-only response. The Server never stores this projection.

```json
{
  "ok": true,
  "data": {
    "schemaVersion": 1,
    "session": {"id": "...", "title": "...", "provider": "codex"},
    "snapshot": {"id": "..."},
    "turns": [{"id": "turn-12", "items": [{"type": "userMessage", "content": [{"type": "text", "text": "..."}]}]}],
    "page": {"hasMore": true, "nextCursor": "..."},
    "freshness": {"cache": "current"}
  },
  "next_cursor": "..."
}
```

The opaque cursor is pinned to the returned snapshot and reads older turns. Pass it back unchanged with `--cursor`. `--include-outputs` includes tool results and reasoning; `--max-output-chars-per-item` truncates individual tool outputs without truncating user or agent messages.
