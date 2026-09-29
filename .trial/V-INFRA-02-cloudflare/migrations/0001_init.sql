CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE shared_items (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('session', 'files', 'skill')),
  name TEXT NOT NULL,
  root_oid TEXT,
  withdrawn_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sync_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES shared_items(id) ON DELETE CASCADE,
  root_oid TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE indexed_items (
  item_id TEXT PRIMARY KEY,
  root_oid TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A successful root change and its durable outbox record share one D1 statement
-- transaction. This avoids the D1/R2/Queue distributed-transaction trap.
CREATE TRIGGER enqueue_root_change
AFTER UPDATE OF root_oid ON shared_items
WHEN NEW.root_oid IS NOT OLD.root_oid AND NEW.root_oid IS NOT NULL
BEGIN
  INSERT INTO sync_jobs(item_id, root_oid) VALUES (NEW.id, NEW.root_oid);
END;
