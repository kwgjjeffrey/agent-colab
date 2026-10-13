-- Published Skill packages are immutable; Channel references and installable Git projections stay shared.
create table skill_releases (
 id uuid primary key,
 asset_id uuid not null references shared_assets(id),
 version text not null,
 artifact_sha256 text not null,
 artifact_blob_key text not null,
 artifact_size bigint not null check(artifact_size>0),
 revision_id uuid not null references file_revisions(id),
 root_oid text not null,
 source_commit text,
 release_notes text not null default '',
 published_by uuid not null references users(id),
 created_at timestamptz not null default now(),
 unique(asset_id,version)
);
create table skill_publishers (
 asset_id uuid not null references shared_assets(id),
 user_id uuid not null references users(id),
 primary key(asset_id,user_id)
);
