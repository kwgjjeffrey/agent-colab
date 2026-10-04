create table canvases (
    id uuid primary key,
    channel_id uuid not null references channels(id) on delete cascade,
    title text not null check (char_length(title) between 1 and 200),
    schema_version integer not null default 1 check (schema_version > 0),
    created_by_member_id uuid not null references organization_members(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
);

create index canvases_channel_active_idx
    on canvases(channel_id, updated_at desc)
    where archived_at is null;

create table canvas_updates (
    canvas_id uuid not null references canvases(id) on delete cascade,
    server_seq bigint not null,
    client_update_id uuid not null,
    actor_member_id uuid not null references organization_members(id),
    device_id uuid,
    encoding text not null default 'yjs-v1' check (encoding = 'yjs-v1'),
    update_bytes bytea not null check (octet_length(update_bytes) between 1 and 1048576),
    byte_size integer not null check (byte_size = octet_length(update_bytes)),
    created_at timestamptz not null default now(),
    primary key (canvas_id, server_seq),
    unique (canvas_id, client_update_id)
);

create index canvas_updates_created_idx on canvas_updates(canvas_id, created_at);
