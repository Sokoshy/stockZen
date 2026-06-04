-- Migration: Tighten INSERT policies for tenant isolation
-- Replaces overly permissive WITH CHECK (true) policies with tenant-scoped checks

-- Tenants: keep WITH CHECK (true) — tenant creation is a bootstrapping operation
-- The sign-up flow inserts into tenants BEFORE setTenantContext() is called,
-- because the tenant UUID is auto-generated at INSERT time (chicken-and-egg).
-- Post-creation isolation is enforced by SELECT/UPDATE/DELETE policies.
-- No change needed — the original policy is intentionally permissive.

-- Tenant memberships: allow insert only when tenant_id matches context
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'membership_isolation_insert'
  ) THEN
    DROP POLICY "membership_isolation_insert" ON "tenant_memberships";
  END IF;
  CREATE POLICY "membership_isolation_insert" ON "tenant_memberships"
    FOR INSERT WITH CHECK (
      tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    );
END
$$;

-- Audit events: allow insert only when tenant_id matches context
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_allow_insert'
  ) THEN
    DROP POLICY "audit_events_allow_insert" ON "audit_events";
  END IF;
  CREATE POLICY "audit_events_tenant_isolation_insert" ON "audit_events"
    FOR INSERT WITH CHECK (
      tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    );
END
$$;
