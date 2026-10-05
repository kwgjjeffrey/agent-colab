-- Nullable for historical requests; no backfilled fictional trace identity.
ALTER TABLE agent_requests ADD COLUMN trace_context jsonb;
