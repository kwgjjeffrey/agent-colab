create table channel_invitations (
    channel_id uuid not null references channels(id) on delete cascade,
    email text not null,
    role text not null check (role in ('admin', 'member')),
    invited_by uuid not null references users(id),
    created_at timestamptz not null default now(),
    primary key (channel_id, email)
);
