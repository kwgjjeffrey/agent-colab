create table if not exists colab_schema_metadata (
    singleton boolean primary key default true check (singleton),
    installed_at timestamptz not null default now()
);

insert into colab_schema_metadata (singleton)
values (true)
on conflict (singleton) do nothing;
