drop policy git_objects_insert_contributor on storage.objects;
create policy git_objects_insert_contributor on storage.objects for insert to authenticated with check (
  bucket_id = 'git-objects' and exists (
    select 1 from public.channel_shares s
    where s.id = ((storage.foldername(storage.objects.name))[2])::uuid
      and s.channel_id = ((storage.foldername(storage.objects.name))[1])::uuid
      and s.contributor_id = (select auth.uid()) and s.state = 'active'
  )
);
