create table canvas_images (
 id uuid primary key,
 canvas_id uuid not null references canvases(id) on delete cascade,
 blob_key text unique,
 content_type text not null,
 byte_size bigint not null check(byte_size between 1 and 20971520),
 sha256 text not null,
 image_interpretation text not null default '' check(octet_length(image_interpretation)<=32000),
 created_at timestamptz not null default now(),
 unreferenced_since timestamptz default now()
);
create index canvas_images_gc on canvas_images(unreferenced_since) where blob_key is not null;
