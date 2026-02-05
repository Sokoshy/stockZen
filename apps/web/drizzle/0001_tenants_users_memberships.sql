-- Migration: Add tenants and tenant_memberships tables
-- Created for Story 1.2: Sign up + Create Tenant (Admin) + Start Session

-- Create tenant role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_role') THEN
    CREATE TYPE "tenant_role" AS ENUM ('Admin', 'Manager', 'Operator');
  END IF;
END
$$;

-- Create tenants table
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create tenant_memberships table
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" "tenant_role" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("tenant_id", "user_id")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_tenant_id" ON "tenant_memberships"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_memberships_user_id" ON "tenant_memberships"("user_id");

-- Enable Row Level Security on tenant-scoped tables
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
-- Tenants table policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenant_isolation_select'
  ) THEN
    CREATE POLICY "tenant_isolation_select" ON "tenants"
      FOR SELECT USING (
        id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenant_isolation_insert'
  ) THEN
    CREATE POLICY "tenant_isolation_insert" ON "tenants"
      FOR INSERT WITH CHECK (true); -- Allow insert during signup (transaction context)
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenant_isolation_update'
  ) THEN
    CREATE POLICY "tenant_isolation_update" ON "tenants"
      FOR UPDATE USING (
        id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenant_isolation_delete'
  ) THEN
    CREATE POLICY "tenant_isolation_delete" ON "tenants"
      FOR DELETE USING (
        id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;
END
$$;

-- Tenant memberships table policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'membership_isolation_select'
  ) THEN
    CREATE POLICY "membership_isolation_select" ON "tenant_memberships"
      FOR SELECT USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'membership_isolation_insert'
  ) THEN
    CREATE POLICY "membership_isolation_insert" ON "tenant_memberships"
      FOR INSERT WITH CHECK (true); -- Allow insert during signup (transaction context)
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'membership_isolation_update'
  ) THEN
    CREATE POLICY "membership_isolation_update" ON "tenant_memberships"
      FOR UPDATE USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'membership_isolation_delete'
  ) THEN
    CREATE POLICY "membership_isolation_delete" ON "tenant_memberships"
      FOR DELETE USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;
END
$$;
