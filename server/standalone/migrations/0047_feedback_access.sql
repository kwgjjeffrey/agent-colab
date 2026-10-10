-- Existing builtin reviewer grants were operator-provisioned before GUI management existed.
create table feedback_managers(asset_key text not null, user_id uuid not null references users(id), primary key(asset_key,user_id));
insert into feedback_managers select asset_key,user_id from feedback_reviewers where asset_key='builtin:agent-colab';
create table feedback_access_events(id bigint generated always as identity primary key,asset_key text not null,actor_user_id uuid not null references users(id),subject_user_id uuid not null references users(id),action text not null check(action in ('grant','revoke')),created_at timestamptz not null default now());
create index feedback_access_events_asset on feedback_access_events(asset_key,id);
