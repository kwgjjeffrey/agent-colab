-- Record the terminal transition once; repeated completion receipts must not
-- increase duration. Unknown legacy completion times remain unknown.
alter table agent_requests add column finished_at timestamptz;
-- Earlier Codex records can supply a genuine completion timestamp. Do not use
-- migration time or the diagnostic upload time as a substitute.
update agent_requests ar set finished_at = to_timestamp(record.completed_at::double precision)
from (
  select request_id, max((event->'params'->'turn'->>'completedAt')::numeric) completed_at
  from agent_request_events, jsonb_array_elements(events) event
  where event->>'method' = 'turn/completed'
    and jsonb_typeof(event->'params'->'turn'->'completedAt') = 'number'
  group by request_id
) record
where ar.id = record.request_id and ar.state in ('succeeded','failed','rejected','cancelled')
  and record.completed_at between 0 and 32503680000;
create function record_agent_request_finish() returns trigger language plpgsql as $$
begin
  if new.state in ('succeeded','failed','rejected','cancelled') and old.state not in ('succeeded','failed','rejected','cancelled') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end;
$$;
create trigger agent_request_finish before update of state on agent_requests
for each row execute function record_agent_request_finish();
