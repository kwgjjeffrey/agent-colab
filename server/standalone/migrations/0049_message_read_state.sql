-- Reading progress belongs to membership: leaving and rejoining starts a new boundary.
alter table channel_members add column last_read_message_seq bigint not null default 0
    check (last_read_message_seq >= 0);

update channel_members cm set last_read_message_seq = coalesce(
    (select max(m.seq) from channel_messages m where m.channel_id=cm.channel_id), 0);

create function initialize_message_read_state() returns trigger language plpgsql as $$
begin
    new.last_read_message_seq := coalesce(
        (select max(seq) from channel_messages where channel_id=new.channel_id), 0);
    return new;
end;
$$;
create trigger channel_member_read_boundary before insert on channel_members
    for each row execute function initialize_message_read_state();
