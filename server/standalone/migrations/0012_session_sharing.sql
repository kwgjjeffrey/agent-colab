-- Session payloads remain byte-for-byte source records.  The server only stores immutable
-- segments and an ordered snapshot chain; provider-specific normalization belongs to readers.
alter table channel_shares add column if not exists current_snapshot_id uuid;

create table session_snapshots (
    id uuid primary key,
    share_id uuid not null references channel_shares(id),
    parent_snapshot_id uuid references session_snapshots(id),
    source_cursor text not null,
    created_at timestamptz not null default now()
);

create table session_segments (
    id uuid primary key,
    snapshot_id uuid not null references session_snapshots(id) on delete cascade,
    position integer not null,
    blob_key text not null,
    digest text not null,
    byte_size bigint not null,
    created_at timestamptz not null default now(),
    unique(snapshot_id, position)
);

create index session_snapshots_share_created_idx on session_snapshots(share_id, created_at);
