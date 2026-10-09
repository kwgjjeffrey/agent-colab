-- Apply to an isolated schema at migration 0041, then apply 0042 in one transaction.
-- Nonempty deferred FK queues must be drained before setting asset_id NOT NULL.
do $$
declare u uuid=gen_random_uuid(); org uuid=gen_random_uuid(); member uuid=gen_random_uuid(); channel uuid=gen_random_uuid();
begin
 insert into users(id,email) values(u,u::text||'@backfill-test.invalid');
 insert into organizations(id,name,slug,created_by) values(org,'Backfill validation',org::text,u);
 insert into organization_members(id,organization_id,user_id,role) values(member,org,u,'owner');
 insert into channels(id,name,organization_id,created_by_member_id) values(channel,'Old Channel',org,member);
 insert into channel_members(channel_id,organization_id,organization_member_id,role) values(channel,org,member,'owner');
 insert into channel_shares(id,channel_id,contributor_member_id,name,kind,source_adapter,state)
 values(gen_random_uuid(),channel,member,'Old Files','files','shadow-git-v1','active'),
       (gen_random_uuid(),channel,member,'Old Skill','skill','shadow-git-v1','withdrawn'),
       (gen_random_uuid(),channel,member,'Old Session','session','codex-jsonl-v1','active');
end $$;
