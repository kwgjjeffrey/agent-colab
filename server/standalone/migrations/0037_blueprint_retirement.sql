-- Retain referenced Agent identities and request history after configuration deletion.
-- Active routing is removed in the same transaction; historical foreign keys stay valid.
alter table agent_blueprints add column deleted_at timestamptz;
alter table agent_blueprints drop constraint agent_blueprints_owner_member_id_name_key;
create unique index agent_blueprints_active_owner_name_idx on agent_blueprints(owner_member_id,name) where deleted_at is null;
