create table organizations (
    id uuid primary key,
    name text not null,
    slug text not null unique,
    created_by uuid not null references users(id),
    created_at timestamptz not null default now()
);

create table organization_members (
    organization_id uuid not null references organizations(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    role text not null check (role in ('owner','admin','member')),
    joined_at timestamptz not null default now(),
    primary key (organization_id,user_id)
);

create table organization_identity_providers (
    id uuid primary key,
    organization_id uuid not null references organizations(id) on delete cascade,
    kind text not null check (kind in ('oidc','saml')),
    issuer text not null,
    email_domain text,
    enabled boolean not null default true,
    unique (organization_id,issuer)
);

create table organization_invitations (
    id uuid primary key,
    organization_id uuid not null references organizations(id) on delete cascade,
    channel_id uuid references channels(id) on delete cascade,
    email text not null,
    organization_role text not null default 'member' check (organization_role in ('admin','member')),
    channel_role text check (channel_role in ('admin','member')),
    token_hash text not null unique,
    invited_by uuid not null references users(id),
    expires_at timestamptz not null,
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

insert into organizations(id,name,slug,created_by)
select u.id,coalesce(u.display_name,u.email) || '''s team','personal-' || replace(u.id::text,'-',''),u.id from users u
on conflict do nothing;
insert into organization_members(organization_id,user_id,role)
select id,id,'owner' from users on conflict do nothing;
alter table channels add column organization_id uuid references organizations(id);
update channels set organization_id=created_by where organization_id is null;
alter table channels alter column organization_id set not null;
create index organization_members_user_idx on organization_members(user_id);
create index organization_invitations_email_idx on organization_invitations(lower(email)) where accepted_at is null and revoked_at is null;
