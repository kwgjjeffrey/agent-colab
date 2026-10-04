-- Messages deliberately reuse Channel membership.  The first release has one room per Channel;
-- standalone DM can later add a conversation scope without duplicating today's authorization.
create table agent_blueprints (
    id uuid primary key,
    organization_id uuid not null references organizations(id) on delete cascade,
    owner_member_id uuid not null references organization_members(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 80),
    loading_instruction text not null default '',
    loading_command text not null default '',
    runtime_device text,
    runtime_agent text,
    invocation_policy text not null default 'awaiting_owner'
        check (invocation_policy in ('refuse', 'awaiting_owner', 'process')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_member_id, name)
);

create table channel_agents (
    channel_id uuid not null references channels(id) on delete cascade,
    blueprint_id uuid not null references agent_blueprints(id) on delete cascade,
    added_by_member_id uuid not null references organization_members(id),
    added_at timestamptz not null default now(),
    primary key (channel_id, blueprint_id)
);

create sequence channel_message_global_seq;
create table channel_messages (
    id uuid primary key,
    channel_id uuid not null references channels(id) on delete cascade,
    seq bigint not null default nextval('channel_message_global_seq'),
    sender_member_id uuid references organization_members(id),
    sender_blueprint_id uuid references agent_blueprints(id),
    body text not null check (char_length(body) between 1 and 20000),
    reply_to_message_id uuid references channel_messages(id),
    client_nonce uuid not null,
    created_at timestamptz not null default now(),
    check ((sender_member_id is null) <> (sender_blueprint_id is null)),
    unique (channel_id, seq),
    unique (channel_id, client_nonce)
);

create index channel_messages_page_idx on channel_messages(channel_id, seq desc);
create index agent_blueprints_owner_idx on agent_blueprints(owner_member_id, updated_at desc);
create index channel_agents_channel_idx on channel_agents(channel_id, added_at);
