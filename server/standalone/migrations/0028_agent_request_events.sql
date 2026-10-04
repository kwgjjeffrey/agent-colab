create table agent_request_events (
  request_id uuid primary key references agent_requests(id) on delete cascade,
  events jsonb not null,
  updated_at timestamptz not null default now()
);
