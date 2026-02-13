-- Migration: Fix audit_events RLS policies for Story 1.9
-- Update RLS policies to allow inserts while keeping read isolation

-- Drop old restrictive policies if they exist
DROP POLICY IF EXISTS "audit_events_isolation_insert" ON "audit_events";
DROP POLICY IF EXISTS "audit_events_isolation_update" ON "audit_events";
DROP POLICY IF EXISTS "audit_events_isolation_delete" ON "audit_events";

-- Create new permissive policies
DO $$
BEGIN
  -- Allow inserts without tenant check (service layer controls this)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_allow_insert'
  ) THEN
    CREATE POLICY "audit_events_allow_insert" ON "audit_events"
      FOR INSERT WITH CHECK (true);
  END IF;

  -- No updates allowed on audit events (append-only)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_no_update'
  ) THEN
    CREATE POLICY "audit_events_no_update" ON "audit_events"
      FOR UPDATE USING (false);
  END IF;

  -- No deletes allowed on audit events (append-only)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_no_delete'
  ) THEN
    CREATE POLICY "audit_events_no_delete" ON "audit_events"
      FOR DELETE USING (false);
  END IF;
END
$$;

-- Ensure FORCE ROW LEVEL SECURITY is enabled
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
