-- Migration: Add audit_events table for Story 1.9
-- Audit events table with tenant scoping for compliance/security tracking

-- Create audit_events table
CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actor_user_id" text,
  "action_type" varchar(100) NOT NULL,
  "target_type" varchar(100),
  "target_id" uuid,
  "status" varchar(20) NOT NULL,
  "context" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for performance and lookups
CREATE INDEX IF NOT EXISTS "idx_audit_events_tenant_created" ON "audit_events"("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_events_tenant_action" ON "audit_events"("tenant_id", "action_type");

-- Enable Row Level Security
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;

-- Force RLS to apply to table owner (bypass RLS disabled)
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
DO $$
BEGIN
  -- Allow inserts without tenant check (service layer controls this)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_allow_insert'
  ) THEN
    CREATE POLICY "audit_events_allow_insert" ON "audit_events"
      FOR INSERT WITH CHECK (true);
  END IF;

  -- Restrict selects to tenant context
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_isolation_select'
  ) THEN
    CREATE POLICY "audit_events_isolation_select" ON "audit_events"
      FOR SELECT USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
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
