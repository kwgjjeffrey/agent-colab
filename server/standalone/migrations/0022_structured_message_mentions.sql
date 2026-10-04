-- Message text remains directly readable while the editor document preserves immutable mention
-- identities. Routing never parses the mutable display label from body.
alter table channel_messages
    add column content jsonb not null default '{"type":"doc","content":[]}'::jsonb;

alter table agent_requests add column trigger_message_id uuid references channel_messages(id);
create unique index agent_requests_trigger_target_idx
    on agent_requests(trigger_message_id, target_blueprint_id)
    where trigger_message_id is not null;
