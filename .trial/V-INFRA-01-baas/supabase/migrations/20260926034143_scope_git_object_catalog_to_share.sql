alter table public.git_objects add column share_id uuid references public.channel_shares(id) on delete cascade;
update public.git_objects set share_id = split_part(storage_path, '/', 2)::uuid;
alter table public.git_objects alter column share_id set not null;
alter table public.git_objects drop constraint git_objects_pkey;
alter table public.git_objects add primary key (share_id, oid);

drop function public.missing_git_objects(text[]);
create or replace function public.missing_git_objects(target_share_id uuid, candidate_oids text[])
returns text[] language plpgsql stable security definer set search_path = ''
as $$
declare result text[];
begin
  if not exists (
    select 1 from public.channel_shares s
    where s.id = target_share_id
      and s.contributor_id = (select auth.uid())
      and s.state = 'active'
  ) then raise exception 'share not found or forbidden'; end if;

  select coalesce(array_agg(candidate), '{}') into result
  from unnest(candidate_oids) candidate
  where not exists (
    select 1 from public.git_objects o
    where o.share_id = target_share_id and o.oid = candidate
  );
  return result;
end;
$$;

create or replace function public.register_git_objects(target_share_id uuid, objects jsonb)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  target_channel_id uuid;
  inserted_count integer;
begin
  select channel_id into target_channel_id
  from public.channel_shares
  where id = target_share_id
    and contributor_id = (select auth.uid())
    and state = 'active';
  if target_channel_id is null then raise exception 'share not found or forbidden'; end if;

  insert into public.git_objects(share_id, oid, storage_path, size)
  select target_share_id, x.oid, x.storage_path, x.size
  from jsonb_to_recordset(objects) as x(oid text, storage_path text, size bigint)
  where x.oid ~ '^[0-9a-f]{40,64}$'
    and x.storage_path like target_channel_id::text || '/' || target_share_id::text || '/%'
  on conflict (share_id, oid) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.missing_git_objects(uuid, text[]) from public, anon;
grant execute on function public.missing_git_objects(uuid, text[]) to authenticated;
