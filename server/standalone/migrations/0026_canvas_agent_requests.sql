alter table agent_requests drop constraint agent_requests_kind_check;
alter table agent_requests add constraint agent_requests_kind_check
    check (kind in ('mention', 'forward', 'canvas_mention'));
