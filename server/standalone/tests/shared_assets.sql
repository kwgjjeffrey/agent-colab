-- Run on an isolated database with all migrations applied; fixtures always roll back.
begin;
do $$
declare
 u uuid=gen_random_uuid(); org uuid=gen_random_uuid(); member uuid=gen_random_uuid();
 ca uuid=gen_random_uuid(); cb uuid=gen_random_uuid(); a uuid=gen_random_uuid(); b uuid=gen_random_uuid();
begin
 insert into users(id,email) values(u,u::text||'@asset-test.invalid');
 insert into organizations(id,name,slug,created_by) values(org,'Asset validation',org::text,u);
 insert into organization_members(id,organization_id,user_id,role) values(member,org,u,'owner');
 insert into channels(id,name,organization_id,created_by_member_id) values(ca,'A',org,member),(cb,'B',org,member);
 insert into channel_members(channel_id,organization_id,organization_member_id,role) values(ca,org,member,'owner'),(cb,org,member,'owner');
 insert into channel_shares(id,channel_id,contributor_member_id,name) values(a,ca,member,'Original');
 insert into channel_shares(id,asset_id,channel_id,contributor_member_id,name) values(b,a,cb,member,'Ignored per-reference name');
 if (select count(*) from shared_assets where id=a)<>1 then raise exception 'asset duplicated'; end if;
 if (select name from channel_shares where id=b)<>'Original' then raise exception 'reference metadata drift'; end if;
 update shared_assets set name='Renamed',current_root_oid='revision-one' where id=a;
 if (select count(*) from channel_shares where asset_id=a and name='Renamed' and current_root_oid='revision-one')<>2 then raise exception 'asset projection failed'; end if;
 update channel_shares set name='Legacy rename' where id=b;
 if (select name from channel_shares where id=a)<>'Legacy rename' then raise exception 'legacy rename not global'; end if;
 update channel_shares set state='withdrawn' where id=a;
 if (select retained_until from shared_assets where id=a) is not null then raise exception 'active reference incorrectly retained'; end if;
 if not exists(select 1 from channel_shares where id=b and state='active' and current_root_oid='revision-one') then raise exception 'withdraw affected other reference'; end if;
 update channel_shares set state='withdrawn' where id=b;
 if not exists(select 1 from shared_assets where id=a and retained_until between now()+interval '23 hours' and now()+interval '25 hours') then raise exception 'retention not set'; end if;
 update channel_shares set state='active' where id=b;
 if (select retained_until from shared_assets where id=a) is not null then raise exception 'reshare retention not cleared'; end if;
end $$;
rollback;
