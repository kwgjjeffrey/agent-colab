-- Only a newly verified external identity extends this lease. Device login and refresh do not.
create table external_login_leases (
    user_id uuid primary key references users(id) on delete cascade,
    provider text not null,
    expires_at timestamptz not null
);
