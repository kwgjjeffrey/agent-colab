-- Refresh tokens are one-time capabilities. Keeping consumed hashes lets the server distinguish
-- an expired/unknown credential from a replay and revoke the whole session family on replay.
create table session_refresh_tokens (
    token_hash text primary key,
    session_id uuid not null references sessions(id) on delete cascade,
    generation bigint not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (session_id, generation)
);

insert into session_refresh_tokens(token_hash, session_id, generation)
select refresh_token_hash, id, 0 from sessions;

create unique index session_refresh_tokens_one_current
    on session_refresh_tokens(session_id) where consumed_at is null;
create index session_refresh_tokens_session on session_refresh_tokens(session_id);
