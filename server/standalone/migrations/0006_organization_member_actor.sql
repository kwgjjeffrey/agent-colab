alter table organization_members add column id uuid;
update organization_members set id = gen_random_uuid() where id is null;
alter table organization_members alter column id set not null;
alter table organization_members add constraint organization_members_id_key unique (id);

alter table channels add column created_by_member_id uuid;
update channels c
set created_by_member_id = om.id
from organization_members om
where om.organization_id = c.organization_id and om.user_id = c.created_by;
alter table channels alter column created_by_member_id set not null;
alter table channels add constraint channels_created_by_member_id_fkey
    foreign key (created_by_member_id) references organization_members(id);

alter table channel_members add column organization_member_id uuid;
update channel_members cm
set organization_member_id = om.id
from channels c, organization_members om
where c.id = cm.channel_id
  and om.organization_id = c.organization_id
  and om.user_id = cm.user_id;
alter table channel_members alter column organization_member_id set not null;
alter table channel_members add constraint channel_members_organization_member_id_fkey
    foreign key (organization_member_id) references organization_members(id) on delete cascade;
alter table channel_members drop constraint channel_members_pkey;
alter table channel_members add primary key (channel_id, organization_member_id);

alter table organization_invitations add column invited_by_member_id uuid;
update organization_invitations oi
set invited_by_member_id = om.id
from organization_members om
where om.organization_id = oi.organization_id and om.user_id = oi.invited_by;
alter table organization_invitations alter column invited_by_member_id set not null;
alter table organization_invitations add constraint organization_invitations_invited_by_member_id_fkey
    foreign key (invited_by_member_id) references organization_members(id);

alter table channel_members drop column user_id;
alter table channels drop column created_by;
alter table organization_invitations drop column invited_by;
drop table channel_invitations;

create index organization_members_user_organization_idx
    on organization_members(user_id, organization_id);
create index channel_members_organization_member_idx
    on channel_members(organization_member_id);
