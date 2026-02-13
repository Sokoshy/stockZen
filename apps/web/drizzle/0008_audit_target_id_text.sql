-- Migration: Allow non-UUID audit target identifiers
-- User IDs from Better Auth are text, while some targets remain UUIDs.

ALTER TABLE "audit_events"
  ALTER COLUMN "target_id" TYPE text
  USING "target_id"::text;
