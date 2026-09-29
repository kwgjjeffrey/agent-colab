create table channels (
    id uuid primary key,
    name text not null check (char_length(name) between 1 and 80),
    icon text,
    created_by uuid not null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table channel_members (
    channel_id uuid not null references channels(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'member')),
    joined_at timestamptz not null default now(),
    primary key (channel_id, user_id)
);

create index channel_members_user_id_idx on channel_members(user_id);
