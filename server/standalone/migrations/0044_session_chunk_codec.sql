-- Legacy segments remain identity bytes; no blob rewrite or transcript backfill.
alter table session_segments
    add column codec text not null default 'identity' check (codec in ('identity','zstd')),
    add column decoded_byte_size bigint,
    add column decoded_digest text,
    add constraint session_chunk_decoded_metadata check (
        (codec = 'identity' and decoded_byte_size is null and decoded_digest is null)
        or (codec = 'zstd' and decoded_byte_size is not null and decoded_digest is not null and decoded_byte_size > 0 and decoded_byte_size <= 41943040
            and decoded_digest ~ '^[0-9a-f]{64}$')
    );

-- The index is a contributor-produced opaque locator projection, not messages.
alter table session_snapshots
    add column read_index_blob_key text,
    add column read_index_digest text,
    add column read_index_byte_size bigint,
    add column read_index_decoded_digest text,
    add column read_index_decoded_byte_size bigint,
    add constraint session_read_index_complete check (
        (read_index_blob_key is null and read_index_digest is null and read_index_byte_size is null
          and read_index_decoded_digest is null and read_index_decoded_byte_size is null)
        or (read_index_blob_key is not null and read_index_digest is not null and read_index_byte_size is not null
          and read_index_decoded_digest is not null and read_index_decoded_byte_size is not null
          and read_index_digest ~ '^[0-9a-f]{64}$' and read_index_decoded_digest ~ '^[0-9a-f]{64}$'
          and read_index_byte_size > 0 and read_index_decoded_byte_size > 0 and read_index_decoded_byte_size <= 41943040)
    );
create unique index session_read_index_blob_key on session_snapshots(read_index_blob_key) where read_index_blob_key is not null;
