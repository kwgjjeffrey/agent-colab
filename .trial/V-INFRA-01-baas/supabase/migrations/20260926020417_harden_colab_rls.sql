create schema if not exists private;

alter function public.is_channel_member(uuid) set schema private;
alter function public.is_channel_admin(uuid) set schema private;

alter function private.is_channel_member(uuid) set search_path = '';
alter function private.is_channel_admin(uuid) set search_path = '';

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke execute on function private.is_channel_member(uuid) from public, anon;
revoke execute on function private.is_channel_admin(uuid) from public, anon;
grant execute on function private.is_channel_member(uuid) to authenticated;
grant execute on function private.is_channel_admin(uuid) to authenticated;

revoke execute on function public.create_channel(text) from public, anon;
revoke execute on function public.commit_share_root(uuid, text, text) from public, anon;
grant execute on function public.create_channel(text) to authenticated;
grant execute on function public.commit_share_root(uuid, text, text) to authenticated;

drop policy channels_read_member on public.channels;
create policy channels_read_member on public.channels for select to authenticated
  using ((select private.is_channel_member(id)));

drop policy members_read_member on public.channel_members;
create policy members_read_member on public.channel_members for select to authenticated
  using ((select private.is_channel_member(channel_id)));
drop policy members_insert_admin on public.channel_members;
create policy members_insert_admin on public.channel_members for insert to authenticated
  with check ((select private.is_channel_admin(channel_id)));
drop policy members_update_admin on public.channel_members;
create policy members_update_admin on public.channel_members for update to authenticated
  using ((select private.is_channel_admin(channel_id)))
  with check ((select private.is_channel_admin(channel_id)));
drop policy members_delete_admin on public.channel_members;
create policy members_delete_admin on public.channel_members for delete to authenticated
  using ((select private.is_channel_admin(channel_id)) and role <> 'owner');

drop policy shares_read_member on public.channel_shares;
create policy shares_read_member on public.channel_shares for select to authenticated
  using (state = 'active' and (select private.is_channel_member(channel_id)));
drop policy shares_insert_member on public.channel_shares;
create policy shares_insert_member on public.channel_shares for insert to authenticated
  with check (contributor_id = (select auth.uid()) and (select private.is_channel_member(channel_id)));
drop policy shares_update_owner on public.channel_shares;
create policy shares_update_owner on public.channel_shares for update to authenticated
  using (contributor_id = (select auth.uid()))
  with check (contributor_id = (select auth.uid()));

drop policy git_objects_read_channel_member on storage.objects;
create policy git_objects_read_channel_member on storage.objects for select to authenticated using (
  bucket_id = 'git-objects' and (select private.is_channel_member(((storage.foldername(name))[1])::uuid))
);

create index channels_created_by_idx on public.channels(created_by);
create index channel_members_user_id_idx on public.channel_members(user_id);
create index channel_shares_channel_id_idx on public.channel_shares(channel_id);
create index channel_shares_contributor_id_idx on public.channel_shares(contributor_id);
create index sync_jobs_share_id_idx on public.sync_jobs(share_id);
create index sync_jobs_pending_idx on public.sync_jobs(created_at) where state = 'pending';
