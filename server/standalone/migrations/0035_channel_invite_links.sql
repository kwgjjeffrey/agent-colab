create table channel_invite_links (
    id uuid primary key,
    channel_id uuid not null references channels(id) on delete cascade,
    created_by uuid not null references users(id),
    token_hash text not null unique,
    expires_at timestamptz not null default now()+interval '24 hours',
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);
