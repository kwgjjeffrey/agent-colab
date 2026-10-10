-- Feedback evidence is private to the reporter and the asset's authorized reviewers.
create table feedback_records (
 id uuid primary key,
 asset_key text not null check (asset_key <> ''),
 channel_key text not null check (channel_key <> ''),
 reporter_user_id uuid not null references users(id),
 consumer_agent_type text not null,
 skill_version text not null,
 captured_at timestamptz not null,
 metadata jsonb not null,
 session_blob_key text,
 session_digest text,
 session_byte_size bigint,
 analysis_status text not null default 'pending' check (analysis_status in ('pending','completed','failed','disabled')),
 analysis_id uuid,
 comment_markdown text,
 comment_parse_status text not null default 'absent' check (comment_parse_status in ('absent','parsed','unparsed')),
 rating text check (rating in ('positive','negative')),
 task_outcome text,
 positive_tags jsonb not null default '[]',
 negative_tags jsonb not null default '[]',
 task_trajectory jsonb,
 resolution_status text not null default 'unresolved' check (resolution_status in ('unresolved','resolved','ignored')),
 status_revision bigint not null default 0,
 created_at timestamptz not null default now()
);
create index feedback_asset_recent on feedback_records(asset_key,captured_at desc,id desc);
create index feedback_reporter on feedback_records(reporter_user_id);
create index feedback_negative_tags on feedback_records using gin(negative_tags jsonb_path_ops);
create table feedback_reviewers (
 asset_key text not null,
 user_id uuid not null references users(id),
 primary key(asset_key,user_id)
);
create table feedback_status_history (
 feedback_id uuid not null references feedback_records(id),
 revision bigint not null,
 actor_user_id uuid not null references users(id),
 previous_status text not null,
 status text not null,
 reason text not null,
 resolution_refs jsonb not null default '[]',
 changed_at timestamptz not null default now(),
 primary key(feedback_id,revision)
);
