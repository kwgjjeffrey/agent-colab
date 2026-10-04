create table canvas_folders (
    id uuid primary key,
    channel_id uuid not null references channels(id) on delete cascade,
    parent_folder_id uuid references canvas_folders(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 200),
    created_by_member_id uuid not null references organization_members(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index canvas_folders_root_name_idx
    on canvas_folders(channel_id, lower(name))
    where parent_folder_id is null;
create unique index canvas_folders_child_name_idx
    on canvas_folders(parent_folder_id, lower(name))
    where parent_folder_id is not null;

alter table canvases
    add column folder_id uuid references canvas_folders(id) on delete cascade;

create unique index canvases_root_title_idx
    on canvases(channel_id, lower(title))
    where folder_id is null and archived_at is null;
create unique index canvases_folder_title_idx
    on canvases(folder_id, lower(title))
    where folder_id is not null and archived_at is null;
