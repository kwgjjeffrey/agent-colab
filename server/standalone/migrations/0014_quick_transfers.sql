-- Quick Share is deliberately independent from Organizations and Channels. Authorization is
-- possession of one scoped capability; only hashes are persisted so a database disclosure does
-- not reveal usable transfer URLs.
create table quick_transfers (
    id uuid primary key,
    upload_token_hash text not null unique,
    read_token_hash text not null unique,
    revoke_token_hash text not null unique,
    state text not null default 'uploading' check (state in ('uploading', 'ready', 'revoked')),
    created_ip inet not null,
    expires_at timestamptz not null,
    total_bytes bigint not null default 0 check (total_bytes >= 0),
    created_at timestamptz not null default now(),
    finalized_at timestamptz,
    revoked_at timestamptz
);

create index quick_transfers_expiry_idx on quick_transfers (expires_at);
create index quick_transfers_ip_created_idx on quick_transfers (created_ip, created_at);

create table quick_transfer_items (
    id uuid primary key,
    transfer_id uuid not null references quick_transfers(id) on delete cascade,
    position integer not null,
    kind text not null check (kind in ('files', 'session', 'skill')),
    name text not null,
    source_adapter text not null,
    metadata jsonb not null default '{}'::jsonb,
    blob_key text,
    digest text,
    byte_size bigint,
    created_at timestamptz not null default now(),
    unique (transfer_id, position),
    check ((blob_key is null and digest is null and byte_size is null) or
           (blob_key is not null and digest is not null and byte_size is not null and byte_size > 0))
);

