-- Migration: PostgreSQL roles, grants, and RLS policies
-- These are PostgreSQL-specific constructs that Drizzle schema does not manage.

--> statement-breakpoint
-- Role for application connections
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockzen_app') THEN
    CREATE ROLE stockzen_app WITH LOGIN PASSWORD 'stockzen_app_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

--> statement-breakpoint
ALTER ROLE stockzen_app SET search_path TO public;

--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO stockzen_app;

--> statement-breakpoint
-- Grants on all application tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.alerts TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_events TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_movements TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_invitations TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_memberships TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenants TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO stockzen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.verification TO stockzen_app;

--> statement-breakpoint
-- Enable and force RLS on all tenant-scoped tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
-- RLS policies for tenants table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_select' AND polrelid = 'public.tenants'::regclass) THEN
    CREATE POLICY tenant_isolation_select ON public.tenants FOR SELECT USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_insert' AND polrelid = 'public.tenants'::regclass) THEN
    CREATE POLICY tenant_isolation_insert ON public.tenants FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_update' AND polrelid = 'public.tenants'::regclass) THEN
    CREATE POLICY tenant_isolation_update ON public.tenants FOR UPDATE USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_delete' AND polrelid = 'public.tenants'::regclass) THEN
    CREATE POLICY tenant_isolation_delete ON public.tenants FOR DELETE USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;

--> statement-breakpoint
-- RLS policies for tenant_memberships table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_select' AND polrelid = 'public.tenant_memberships'::regclass) THEN
    CREATE POLICY membership_isolation_select ON public.tenant_memberships FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_insert' AND polrelid = 'public.tenant_memberships'::regclass) THEN
    CREATE POLICY membership_isolation_insert ON public.tenant_memberships FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_update' AND polrelid = 'public.tenant_memberships'::regclass) THEN
    CREATE POLICY membership_isolation_update ON public.tenant_memberships FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_delete' AND polrelid = 'public.tenant_memberships'::regclass) THEN
    CREATE POLICY membership_isolation_delete ON public.tenant_memberships FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;

--> statement-breakpoint
-- RLS policies for tenant_invitations table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_select' AND polrelid = 'public.tenant_invitations'::regclass) THEN
    CREATE POLICY invitation_isolation_select ON public.tenant_invitations FOR SELECT USING (
      tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
      OR token_hash = current_setting('app.invitation_token_hash', true)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_insert' AND polrelid = 'public.tenant_invitations'::regclass) THEN
    CREATE POLICY invitation_isolation_insert ON public.tenant_invitations FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_update' AND polrelid = 'public.tenant_invitations'::regclass) THEN
    CREATE POLICY invitation_isolation_update ON public.tenant_invitations FOR UPDATE USING (
      tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
      OR token_hash = current_setting('app.invitation_token_hash', true)
    ) WITH CHECK (
      tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
      OR token_hash = current_setting('app.invitation_token_hash', true)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'invitation_isolation_delete' AND polrelid = 'public.tenant_invitations'::regclass) THEN
    CREATE POLICY invitation_isolation_delete ON public.tenant_invitations FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;

--> statement-breakpoint
-- RLS policies for products table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_select' AND polrelid = 'public.products'::regclass) THEN
    CREATE POLICY products_isolation_select ON public.products FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_insert' AND polrelid = 'public.products'::regclass) THEN
    CREATE POLICY products_isolation_insert ON public.products FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_update' AND polrelid = 'public.products'::regclass) THEN
    CREATE POLICY products_isolation_update ON public.products FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'products_isolation_delete' AND polrelid = 'public.products'::regclass) THEN
    CREATE POLICY products_isolation_delete ON public.products FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;

--> statement-breakpoint
-- RLS policies for stock_movements table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'stock_movements_tenant_isolation' AND polrelid = 'public.stock_movements'::regclass) THEN
    CREATE POLICY stock_movements_tenant_isolation ON public.stock_movements FOR ALL USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;

--> statement-breakpoint
-- RLS policies for audit_events table (append-only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_isolation_select' AND polrelid = 'public.audit_events'::regclass) THEN
    CREATE POLICY audit_events_isolation_select ON public.audit_events FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_tenant_isolation_insert' AND polrelid = 'public.audit_events'::regclass) THEN
    CREATE POLICY audit_events_tenant_isolation_insert ON public.audit_events FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_no_update' AND polrelid = 'public.audit_events'::regclass) THEN
    CREATE POLICY audit_events_no_update ON public.audit_events FOR UPDATE USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_no_delete' AND polrelid = 'public.audit_events'::regclass) THEN
    CREATE POLICY audit_events_no_delete ON public.audit_events FOR DELETE USING (false);
  END IF;
END
$$;

--> statement-breakpoint
-- RLS policies for alerts table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_select' AND polrelid = 'public.alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_select ON public.alerts FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_insert' AND polrelid = 'public.alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_insert ON public.alerts FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_update' AND polrelid = 'public.alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_update ON public.alerts FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_delete' AND polrelid = 'public.alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_delete ON public.alerts FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;
