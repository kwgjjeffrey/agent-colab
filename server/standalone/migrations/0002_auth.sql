create table users (
    id uuid primary key,
    email text not null unique,
    display_name text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table auth_identities (
    provider text not null,
    subject text not null,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (provider, subject)
);

create table sessions (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    access_token_hash text not null unique,
    refresh_token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    revoked_at timestamptz
);

create index sessions_user_id_idx on sessions(user_id);
