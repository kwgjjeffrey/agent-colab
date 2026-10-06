-- Accounts remain the authorization principal. One installation key may authenticate several
-- accounts; revocation retains the binding so it cannot silently bootstrap a replacement account.
create table login_devices (
    id uuid primary key,
    public_key text not null unique,
    name text not null,
    created_at timestamptz not null default now()
);
create table account_devices (
    user_id uuid not null references users(id) on delete cascade,
    device_id uuid not null references login_devices(id),
    bound_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    primary key(user_id, device_id)
);
create table device_login_challenges (
    nonce text primary key,
    public_key text not null,
    purpose text not null check(purpose in ('discover','login','bind')),
    user_id uuid,
    expires_at timestamptz not null default now() + interval '5 minutes'
);
alter table sessions add column login_device_id uuid references login_devices(id);
create index sessions_device_idx on sessions(user_id,login_device_id) where revoked_at is null;
