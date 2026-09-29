-- Skill shares reuse the Shared Item row and opaque Git revision chain used by Files.
-- Only presentation metadata belongs here; package contents remain authoritative in blob storage.
alter table channel_shares add column if not exists description text;

