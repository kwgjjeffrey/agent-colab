-- A claimed request is only "working" after Local Core acknowledges the complete command.
-- Keeping this durable prevents a lost WebSocket hint from leaving the GUI with a false state.
alter table agent_requests add column accepted_at timestamptz;
