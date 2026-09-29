revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy profile_update_self on public.profiles;
create policy profile_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
