alter table canvases add column sort_order bigint not null default 0;
create index canvases_sibling_order_idx on canvases(channel_id, folder_id, sort_order, id) where archived_at is null;
