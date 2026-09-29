-- Human-facing Colab references address Channels and Shared Items by name.
-- Channel-name ambiguity is scoped to each member's visible Channels, not the
-- whole Organization, so it is enforced transactionally when Channels are
-- created, renamed or joined. A plain unique index cannot express that rule.

create unique index channel_shares_active_name_unique
    on channel_shares(channel_id, kind, lower(name))
    where state = 'active';
