-- Isolated transactional fixture: no production task rows are inserted or modified.
begin;
create temporary table timing_fixture(id integer primary key, state text, finished_at timestamptz);
create trigger timing_fixture_finish before update of state on timing_fixture
for each row execute function record_agent_request_finish();
insert into timing_fixture values (1,'running',null), (2,'queued',null), (3,'running',null);
update timing_fixture set state='succeeded' where id=1;
do $$ declare first_time timestamptz; begin
  select finished_at into first_time from timing_fixture where id=1;
  if first_time is null then raise exception 'terminal transition failed to record finish'; end if;
  update timing_fixture set state='succeeded' where id=1;
  if (select finished_at from timing_fixture where id=1) is distinct from first_time then
    raise exception 'duplicate receipt changed finish';
  end if;
  update timing_fixture set state='running' where id=2;
  if (select finished_at from timing_fixture where id=2) is not null then raise exception 'nonterminal transition set finish'; end if;
  update timing_fixture set state='failed' where id=3;
  if (select finished_at from timing_fixture where id=3) is null then raise exception 'failure did not set finish'; end if;
end $$;
rollback;
