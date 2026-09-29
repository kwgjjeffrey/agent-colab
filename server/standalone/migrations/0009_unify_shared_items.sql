alter table file_shares rename to channel_shares;
alter table channel_shares add column kind text not null default 'files'
    check (kind in ('files','session','skill'));
alter table channel_shares add column source_adapter text not null default 'shadow-git-v1';
alter index file_shares_channel_active_idx rename to channel_shares_channel_active_idx;
