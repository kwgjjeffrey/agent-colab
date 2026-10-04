-- A runtime is a provider installed for one Organization Member on one physical device.
-- Blueprints reference this registered identity; provider thread IDs remain private to Local Core.
create table agent_runtimes (
    id uuid primary key,
    organization_id uuid not null references organizations(id) on delete cascade,
    owner_member_id uuid not null references organization_members(id) on delete cascade,
    device_id uuid not null,
    device_name text not null check (char_length(device_name) between 1 and 120),
    provider text not null check (provider in ('codex', 'claude', 'myflicker')),
    skill_version text not null,
    available boolean not null default true,
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (owner_member_id, device_id, provider)
);

alter table agent_blueprints add column runtime_id uuid references agent_runtimes(id);
create index agent_runtimes_owner_idx on agent_runtimes(owner_member_id, available, last_seen_at desc);

create table agent_requests (
    id uuid primary key,
    channel_id uuid not null references channels(id) on delete cascade,
    target_blueprint_id uuid not null references agent_blueprints(id) on delete cascade,
    runtime_id uuid not null references agent_runtimes(id),
    requester_member_id uuid not null references organization_members(id),
    kind text not null check (kind in ('mention','forward')),
    query text not null,
    trigger_seq bigint,
    state text not null check (state in ('awaiting_owner','queued','running','succeeded','failed','rejected','cancelled')),
    created_at timestamptz not null default now()
);
create table agent_request_messages (
    request_id uuid not null references agent_requests(id) on delete cascade,
    message_id uuid not null references channel_messages(id),
    ordinal integer not null,
    primary key(request_id,message_id), unique(request_id,ordinal)
);
create table agent_request_outputs (
    request_id uuid primary key references agent_requests(id) on delete cascade,
    message_id uuid not null unique references channel_messages(id) on delete cascade
);
create index agent_requests_target_idx on agent_requests(target_blueprint_id,created_at desc);
create index agent_requests_runtime_queue_idx on agent_requests(runtime_id,created_at) where state='queued';
