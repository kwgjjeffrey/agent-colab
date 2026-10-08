-- Existing Canvas directories become mixed catalogs without changing their IDs.
-- Keep the physical name for compatibility with already installed clients.
alter table canvas_folders add constraint canvas_folders_channel_id_unique unique (channel_id, id);
alter table canvas_folders drop constraint canvas_folders_parent_folder_id_fkey;
alter table canvas_folders add constraint catalog_parent_same_channel
    foreign key (channel_id, parent_folder_id)
    references canvas_folders(channel_id, id);
alter table canvas_folders add constraint catalog_not_own_parent
    check (parent_folder_id is distinct from id);
create index catalog_parent_idx on canvas_folders(channel_id, parent_folder_id, id);

-- Deleting a directory must never implicitly archive/delete its contents.
alter table canvases drop constraint canvases_folder_id_fkey;
alter table canvases add constraint canvas_catalog_same_channel
    foreign key (channel_id, folder_id)
    references canvas_folders(channel_id, id);

alter table channel_shares add column catalog_id uuid;
alter table channel_shares add constraint share_catalog_same_channel
    foreign key (channel_id, catalog_id)
    references canvas_folders(channel_id, id);
create index share_catalog_idx on channel_shares(channel_id, catalog_id, id)
    where state = 'active';
