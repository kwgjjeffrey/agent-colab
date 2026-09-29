-- Shared-item metadata stays relational, while each immutable Git pack is stored in Blob storage
-- and referenced by file_revisions.blob_key. Migration 0009 generalizes file_shares into the
-- channel_shares base table used by files, sessions and skills.
create table file_shares (
    id uuid primary key,
    channel_id uuid not null,
    contributor_member_id uuid not null,
    name text not null check (char_length(name) between 1 and 120),
    state text not null default 'active' check (state in ('active','withdrawn')),
    current_root_oid text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (channel_id, contributor_member_id)
        references channel_members(channel_id, organization_member_id)
);

-- A revision is an append-only publication event, not a general-purpose version-management UI.
-- parent_root_oid supplies the optimistic concurrency/CAS link used when advancing the share.
create table file_revisions (
    id uuid primary key,
    share_id uuid not null references file_shares(id) on delete cascade,
    root_oid text not null,
    parent_root_oid text,
    blob_key text not null,
    byte_size bigint not null check (byte_size >= 0),
    created_at timestamptz not null default now(),
    unique (share_id, root_oid)
);

create index file_shares_channel_active_idx
    on file_shares(channel_id, updated_at desc) where state='active';
create index file_revisions_share_created_idx
    on file_revisions(share_id, created_at);
