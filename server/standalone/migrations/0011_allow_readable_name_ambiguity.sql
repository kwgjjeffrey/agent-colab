-- Readable names are ergonomic selectors, not globally unique identities.
-- Local Core resolves them inside the active account/Organization/authorization scope and
-- returns candidates when a complete readable path remains ambiguous. UUID references are the
-- explicit fallback after a user or Agent selects one candidate.
drop index if exists channel_shares_active_name_unique;
