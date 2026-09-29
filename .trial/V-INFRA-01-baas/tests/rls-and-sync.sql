\set ON_ERROR_STOP on
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a@trial.invalid', '', now(), '{}', '{"display_name":"A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'b@trial.invalid', '', now(), '{}', '{"display_name":"B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'c@trial.invalid', '', now(), '{}', '{"display_name":"C"}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select id as channel_id from public.create_channel('V-INFRA-01') \gset
select set_config('app.channel_id', :'channel_id', true);

insert into public.channel_members(channel_id, user_id, role)
values (:'channel_id', '10000000-0000-0000-0000-000000000002', 'member');

insert into public.channel_shares(channel_id, contributor_id, kind, name)
values (:'channel_id', '10000000-0000-0000-0000-000000000001', 'files', 'fixture')
returning id as share_id \gset
select set_config('app.share_id', :'share_id', true);

select current_root_oid
from public.commit_share_root(
  :'share_id', null,
  '1111111111111111111111111111111111111111'
);

do $$
begin
  if (select count(*) from public.sync_jobs where share_id = current_setting('app.share_id')::uuid) <> 0 then
    raise exception 'authenticated client can read internal sync_jobs';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if (select count(*) from public.channels where id = current_setting('app.channel_id')::uuid) <> 1 then
    raise exception 'member cannot read channel';
  end if;
  if (select count(*) from public.channel_shares where id = current_setting('app.share_id')::uuid) <> 1 then
    raise exception 'member cannot read active share';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$
begin
  if (select count(*) from public.channels where id = current_setting('app.channel_id')::uuid) <> 0 then
    raise exception 'outsider can read channel';
  end if;
  if (select count(*) from public.channel_shares where id = current_setting('app.share_id')::uuid) <> 0 then
    raise exception 'outsider can read share';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
delete from public.channel_members
where channel_id = :'channel_id'
  and user_id = '10000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if (select count(*) from public.channel_shares where id = current_setting('app.share_id')::uuid) <> 0 then
    raise exception 'removed member can still read share';
  end if;
end $$;

reset role;
rollback;

select 'PASS: channel RLS, share RLS, member removal, root commit and job enqueue' as result;
