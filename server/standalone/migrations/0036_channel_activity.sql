-- Recent consumption, not an append-only audit of every tool call or page read.
create table share_read_activity (
    share_id uuid not null references channel_shares(id) on delete cascade,
    reader_member_id uuid not null references organization_members(id) on delete cascade,
    channel_id uuid not null references channels(id) on delete cascade,
    read_at timestamptz not null default now(),
    primary key (share_id, reader_member_id)
);
create index share_read_activity_channel_recent_idx on share_read_activity(channel_id, read_at desc);
create index share_read_activity_reader_idx on share_read_activity(reader_member_id);
create index channel_shares_created_activity_idx on channel_shares(channel_id, created_at desc, id desc) where state='active';
create index agent_requests_channel_activity_idx on agent_requests(channel_id, created_at desc, id desc);
create index canvases_created_activity_idx on canvases(channel_id, created_at desc, id desc) where archived_at is null;
