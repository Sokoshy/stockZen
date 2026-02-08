-- Migration: Add tenant_invitations table for Story 1.6
-- Invitation system with revocable + expiring links

-- Create tenant_invitations table
CREATE TABLE IF NOT EXISTS "tenant_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "role" "tenant_role" NOT NULL,
  "token_hash" varchar(255) NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "used_at" timestamp with time zone,
  "invited_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for performance and lookups
CREATE INDEX IF NOT EXISTS "idx_invitations_tenant_id" ON "tenant_invitations"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_invitations_token_hash" ON "tenant_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "idx_invitations_email" ON "tenant_invitations"("email");
CREATE INDEX IF NOT EXISTS "idx_invitations_tenant_email" ON "tenant_invitations"("tenant_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_invitations_tenant_email_pending"
  ON "tenant_invitations"("tenant_id", lower("email"))
  WHERE "revoked_at" IS NULL AND "used_at" IS NULL;

-- Enable Row Level Security
ALTER TABLE "tenant_invitations" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_select'
  ) THEN
    CREATE POLICY "invitation_isolation_select" ON "tenant_invitations"
      FOR SELECT USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
        OR token_hash = current_setting('app.invitation_token_hash', true)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_insert'
  ) THEN
    CREATE POLICY "invitation_isolation_insert" ON "tenant_invitations"
      FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_update'
  ) THEN
    CREATE POLICY "invitation_isolation_update" ON "tenant_invitations"
      FOR UPDATE USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
        OR token_hash = current_setting('app.invitation_token_hash', true)
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)::uuid
        OR token_hash = current_setting('app.invitation_token_hash', true)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_invitations' AND policyname = 'invitation_isolation_delete'
  ) THEN
    CREATE POLICY "invitation_isolation_delete" ON "tenant_invitations"
      FOR DELETE USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;
END
$$;
