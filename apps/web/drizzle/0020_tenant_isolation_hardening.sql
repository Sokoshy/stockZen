-- IMPORTANT: Change stockzen_app_password before deploying to production
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockzen_app') THEN
    CREATE ROLE stockzen_app WITH LOGIN PASSWORD 'stockzen_app_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE stockzen_app SET search_path TO public;

GRANT USAGE ON SCHEMA public TO stockzen_app;

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('tenants', 'tenant_memberships', 'tenant_invitations', 'products', 'stock_movements', 'alerts', 'audit_events', 'users', 'session', 'account', 'verification')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO stockzen_app', tbl.tablename);
  END LOOP;
END
$$;

DO $$
DECLARE
  seq RECORD;
BEGIN
  FOR seq IN
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO stockzen_app', seq.sequence_name);
  END LOOP;
END
$$;

ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;

ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_select' AND polrelid = 'alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_select ON alerts FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_insert' AND polrelid = 'alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_insert ON alerts FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_update' AND polrelid = 'alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_update ON alerts FOR UPDATE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_tenant_isolation_delete' AND polrelid = 'alerts'::regclass) THEN
    CREATE POLICY alerts_tenant_isolation_delete ON alerts FOR DELETE USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;

DROP TABLE IF EXISTS "pg-drizzle_post";
