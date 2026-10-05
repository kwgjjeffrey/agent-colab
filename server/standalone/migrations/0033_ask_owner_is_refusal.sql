-- Historical Ask me first records are refused, never pending approval or replay.
UPDATE agent_requests SET state = 'rejected' WHERE state = 'awaiting_owner';
