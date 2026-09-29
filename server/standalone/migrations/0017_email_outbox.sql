-- Invitations and their notification are one durable business action. The short-lived plaintext
-- invite token exists only while delivery is pending; the row is deleted after successful send.
create table email_outbox (
    id uuid primary key,
    invitation_id uuid not null references organization_invitations(id) on delete cascade,
    kind text not null check (kind in ('organization_invite')),
    payload jsonb not null,
    state text not null default 'pending' check (state in ('pending','sending')),
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    lease_until timestamptz,
    last_error text,
    created_at timestamptz not null default now()
);

create index email_outbox_due on email_outbox(next_attempt_at) where state in ('pending','sending');
