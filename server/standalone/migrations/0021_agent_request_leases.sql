-- Runtime claims are recoverable leases, not permanent state. A crashed Local Core must not leave
-- a request displaying Working forever. Long provider calls renew this timestamp in a later
-- heartbeat endpoint; the initial recovery window is deliberately conservative.
alter table agent_requests add column claimed_at timestamptz;
alter table agent_requests add column attempts integer not null default 0;
create index agent_requests_runtime_lease_idx on agent_requests(runtime_id, claimed_at)
where state='running';
