alter table organization_members
    add constraint organization_members_organization_id_id_key unique (organization_id, id);

alter table channels
    drop constraint channels_created_by_member_id_fkey;
alter table channels
    add constraint channels_created_by_member_scope_fkey
    foreign key (organization_id, created_by_member_id)
    references organization_members(organization_id, id);
alter table channels
    add constraint channels_id_organization_id_key unique (id, organization_id);

alter table channel_members add column organization_id uuid;
update channel_members cm
set organization_id = c.organization_id
from channels c
where c.id = cm.channel_id;
alter table channel_members alter column organization_id set not null;
alter table channel_members
    drop constraint channel_members_channel_id_fkey;
alter table channel_members
    drop constraint channel_members_organization_member_id_fkey;
alter table channel_members
    add constraint channel_members_channel_scope_fkey
    foreign key (channel_id, organization_id)
    references channels(id, organization_id) on delete cascade;
alter table channel_members
    add constraint channel_members_actor_scope_fkey
    foreign key (organization_id, organization_member_id)
    references organization_members(organization_id, id) on delete cascade;

alter table organization_invitations
    drop constraint organization_invitations_invited_by_member_id_fkey;
alter table organization_invitations
    add constraint organization_invitations_inviter_scope_fkey
    foreign key (organization_id, invited_by_member_id)
    references organization_members(organization_id, id);
