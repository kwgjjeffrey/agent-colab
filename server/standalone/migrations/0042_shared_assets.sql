-- Channel references retain their stable IDs; publication anchors retain revision FKs.
create table shared_assets (
 id uuid primary key,
 owner_user_id uuid not null references users(id),
 kind text not null check (kind in ('files','session','skill')),
 name text not null,
 description text,
 source_adapter text not null,
 source_key text,
 publication_share_id uuid not null unique references channel_shares(id) deferrable initially deferred,
 current_root_oid text,
 current_snapshot_id uuid,
 retained_until timestamptz,
 updated_at timestamptz not null default now()
);
create unique index shared_assets_source_identity on shared_assets(owner_user_id,kind,source_key) where source_key is not null;
create index shared_assets_owner on shared_assets(owner_user_id);
alter table channel_shares add column asset_id uuid references shared_assets(id) deferrable initially deferred;
insert into shared_assets(id,owner_user_id,kind,name,description,source_adapter,publication_share_id,current_root_oid,current_snapshot_id,retained_until)
 select s.id,om.user_id,s.kind,s.name,s.description,s.source_adapter,s.id,s.current_root_oid,s.current_snapshot_id,case when s.state='withdrawn' then now()+interval '24 hours' end
 from channel_shares s join organization_members om on om.id=s.contributor_member_id;
update channel_shares set asset_id=id;
-- Validate deferred backfill FKs before ALTER; populated databases otherwise retain
-- pending constraint-trigger events and PostgreSQL refuses the NOT NULL change.
set constraints all immediate;
alter table channel_shares alter column asset_id set not null;
set constraints all deferred;
create index channel_shares_asset on channel_shares(asset_id,state);
-- Keep historical reference IDs active even if one Channel previously shared a source twice.
-- Registration is owner-serialized and reuses one existing placement for all new requests.
create index channel_shares_active_asset on channel_shares(channel_id,asset_id) where state='active';

create function initialize_share_asset() returns trigger language plpgsql as $$
declare asset shared_assets; owner_id uuid;
begin
 select user_id into owner_id from organization_members where id=new.contributor_member_id;
 if new.asset_id is null then
  new.asset_id:=new.id;
  insert into shared_assets(id,owner_user_id,kind,name,description,source_adapter,publication_share_id)
   values(new.id,owner_id,new.kind,new.name,new.description,new.source_adapter,new.id);
 else
  select * into strict asset from shared_assets where id=new.asset_id;
  if asset.owner_user_id<>owner_id or asset.kind<>new.kind then raise exception 'asset_reference_owner_mismatch'; end if;
  new.name:=asset.name; new.description:=asset.description; new.source_adapter:=asset.source_adapter;
  new.current_root_oid:=asset.current_root_oid; new.current_snapshot_id:=asset.current_snapshot_id;
 end if;
 update shared_assets set retained_until=null where id=new.asset_id;
 return new;
end $$;
create trigger share_asset_initialize before insert on channel_shares for each row execute function initialize_share_asset();

create function project_asset_to_references() returns trigger language plpgsql as $$
begin
 update channel_shares set name=new.name,description=new.description,source_adapter=new.source_adapter,
  current_root_oid=new.current_root_oid,current_snapshot_id=new.current_snapshot_id,updated_at=new.updated_at
 where asset_id=new.id;
 return new;
end $$;
create trigger asset_reference_projection after update of name,description,source_adapter,current_root_oid,current_snapshot_id on shared_assets
 for each row execute function project_asset_to_references();

-- Legacy writers remain compatible; one reference mutation changes the owned asset.
create function reconcile_share_asset() returns trigger language plpgsql as $$
begin
 if pg_trigger_depth()>1 then return new; end if;
 if new.asset_id=old.asset_id and (new.name,new.description,new.current_root_oid,new.current_snapshot_id)
  is distinct from (old.name,old.description,old.current_root_oid,old.current_snapshot_id) then
  update shared_assets set name=new.name,description=new.description,current_root_oid=new.current_root_oid,
   current_snapshot_id=new.current_snapshot_id,updated_at=new.updated_at where id=new.asset_id;
 end if;
 if new.state is distinct from old.state or new.asset_id is distinct from old.asset_id then
  update shared_assets a set retained_until=case when exists(select 1 from channel_shares s where s.asset_id=a.id and s.state='active') then null else coalesce(a.retained_until,now()+interval '24 hours') end
   where a.id in (old.asset_id,new.asset_id);
 end if;
 return new;
end $$;
create trigger share_asset_reconcile after update on channel_shares for each row execute function reconcile_share_asset();
