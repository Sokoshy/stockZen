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
-- Force RLS on all tenant-scoped tables
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alerts FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
-- Explicitly enable RLS on alerts ( FORCE is not enough for ENABLE )
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
-- RLS policies for alerts
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

--> statement-breakpoint
-- RLS policy for tenant_memberships insert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'membership_isolation_insert' AND polrelid = 'public.tenant_memberships'::regclass) THEN
    CREATE POLICY membership_isolation_insert ON public.tenant_memberships FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;

--> statement-breakpoint
-- RLS policy for audit_events insert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'audit_events_tenant_isolation_insert' AND polrelid = 'public.audit_events'::regclass) THEN
    CREATE POLICY audit_events_tenant_isolation_insert ON public.audit_events FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;
