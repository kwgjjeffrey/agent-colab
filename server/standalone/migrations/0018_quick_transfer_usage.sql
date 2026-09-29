-- Quick Share recipients do not have to register. A read may therefore be attributed either to a
-- verified Colab user (when the receiver has an active session) or to one opaque Local Core
-- installation. The creator sees useful access history without receiving an IP address or a
-- capability. Reader keys are already SHA-256 hashes when they reach this table.
create table quick_transfer_accesses (
    transfer_id uuid not null references quick_transfers(id) on delete cascade,
    reader_key_hash text not null,
    user_id uuid references users(id) on delete set null,
    first_accessed_at timestamptz not null default now(),
    last_accessed_at timestamptz not null default now(),
    access_count bigint not null default 1 check (access_count > 0),
    primary key (transfer_id, reader_key_hash)
);

create index quick_transfer_accesses_transfer_time_idx
    on quick_transfer_accesses (transfer_id, last_accessed_at desc);
