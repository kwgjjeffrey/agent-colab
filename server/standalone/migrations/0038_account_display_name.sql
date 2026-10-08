-- Explicit account names must survive future provider logins.
alter table users add column display_name_customized boolean not null default false;
