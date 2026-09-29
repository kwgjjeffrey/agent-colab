create extension if not exists pgcrypto;
create extension if not exists pgmq;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table public.channel_shares (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  contributor_id uuid not null references auth.users(id),
  kind text not null check (kind in ('session', 'files', 'skill')),
  name text not null,
  current_root_oid text check (current_root_oid ~ '^[0-9a-f]{40,64}$'),
  state text not null default 'active' check (state in ('active', 'withdrawn')),
  updated_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create table public.sync_jobs (
  id bigint generated always as identity primary key,
  share_id uuid not null references public.channel_shares(id) on delete cascade,
  root_oid text not null,
  kind text not null check (kind in ('index', 'gc')),
  state text not null default 'pending' check (state in ('pending', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (share_id, root_oid, kind)
);

create or replace function public.is_channel_member(target_channel_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = target_channel_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_channel_admin(target_channel_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = target_channel_id and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create or replace function public.create_channel(channel_name text)
returns public.channels language plpgsql security definer set search_path = public
as $$
declare created public.channels;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.channels(name, created_by)
  values (channel_name, auth.uid()) returning * into created;
  insert into public.channel_members(channel_id, user_id, role)
  values (created.id, auth.uid(), 'owner');
  return created;
end;
$$;

create or replace function public.commit_share_root(
  target_share_id uuid, base_root_oid text, target_root_oid text
)
returns public.channel_shares language plpgsql security definer set search_path = public
as $$
declare committed public.channel_shares;
begin
  if target_root_oid !~ '^[0-9a-f]{40,64}$' then raise exception 'invalid root oid'; end if;
  update public.channel_shares
     set current_root_oid = target_root_oid, updated_at = now()
   where id = target_share_id
     and contributor_id = auth.uid()
     and state = 'active'
     and current_root_oid is not distinct from base_root_oid
  returning * into committed;
  if committed.id is null then
    raise exception 'share not found, forbidden, withdrawn, or root conflict';
  end if;
  insert into public.sync_jobs(share_id, root_oid, kind)
  values (committed.id, target_root_oid, 'index') on conflict do nothing;
  return committed;
end;
$$;

alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_shares enable row level security;
alter table public.sync_jobs enable row level security;

create policy profiles_read_for_authenticated on public.profiles for select to authenticated using (true);
create policy profile_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy channels_read_member on public.channels for select to authenticated using (public.is_channel_member(id));
create policy members_read_member on public.channel_members for select to authenticated using (public.is_channel_member(channel_id));
create policy members_insert_admin on public.channel_members for insert to authenticated with check (public.is_channel_admin(channel_id));
create policy members_update_admin on public.channel_members for update to authenticated using (public.is_channel_admin(channel_id)) with check (public.is_channel_admin(channel_id));
create policy members_delete_admin on public.channel_members for delete to authenticated using (public.is_channel_admin(channel_id) and role <> 'owner');
create policy shares_read_member on public.channel_shares for select to authenticated using (state = 'active' and public.is_channel_member(channel_id));
create policy shares_insert_member on public.channel_shares for insert to authenticated with check (contributor_id = auth.uid() and public.is_channel_member(channel_id));
create policy shares_update_owner on public.channel_shares for update to authenticated using (contributor_id = auth.uid()) with check (contributor_id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit)
values ('git-objects', 'git-objects', false, 1073741824)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy git_objects_read_channel_member on storage.objects for select to authenticated using (
  bucket_id = 'git-objects' and public.is_channel_member(((storage.foldername(name))[1])::uuid)
);
create policy git_objects_insert_contributor on storage.objects for insert to authenticated with check (
  bucket_id = 'git-objects' and exists (
    select 1 from public.channel_shares s
    where s.id = ((storage.foldername(name))[2])::uuid
      and s.channel_id = ((storage.foldername(name))[1])::uuid
      and s.contributor_id = auth.uid() and s.state = 'active'
  )
);

grant select, update on public.profiles to authenticated;
grant select on public.channels to authenticated;
grant select, insert, update, delete on public.channel_members to authenticated;
grant select, insert, update on public.channel_shares to authenticated;
grant execute on function public.create_channel(text) to authenticated;
grant execute on function public.commit_share_root(uuid, text, text) to authenticated;
grant execute on function public.is_channel_member(uuid) to authenticated;
grant execute on function public.is_channel_admin(uuid) to authenticated;

alter publication supabase_realtime add table public.channel_members;
alter publication supabase_realtime add table public.channel_shares;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();
