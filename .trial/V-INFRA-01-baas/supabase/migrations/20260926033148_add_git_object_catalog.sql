create table public.git_objects (
  oid text primary key check (oid ~ '^[0-9a-f]{40,64}$'),
  storage_path text not null unique,
  size bigint not null check (size >= 0),
  created_at timestamptz not null default now()
);

alter table public.git_objects enable row level security;
revoke all on public.git_objects from anon, authenticated;

create or replace function public.missing_git_objects(candidate_oids text[])
returns text[] language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(candidate), '{}')
  from unnest(candidate_oids) candidate
  where not exists (select 1 from public.git_objects o where o.oid = candidate);
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

  insert into public.git_objects(oid, storage_path, size)
  select x.oid, x.storage_path, x.size
  from jsonb_to_recordset(objects) as x(oid text, storage_path text, size bigint)
  where x.oid ~ '^[0-9a-f]{40,64}$'
    and x.storage_path like target_channel_id::text || '/' || target_share_id::text || '/%'
  on conflict (oid) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke execute on function public.missing_git_objects(text[]) from public, anon;
revoke execute on function public.register_git_objects(uuid, jsonb) from public, anon;
grant execute on function public.missing_git_objects(text[]) to authenticated;
grant execute on function public.register_git_objects(uuid, jsonb) to authenticated;
