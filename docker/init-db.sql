-- IMPORTANT: Change stockzen_app_password before deploying to production
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockzen_app') THEN
    CREATE ROLE stockzen_app WITH LOGIN PASSWORD 'stockzen_app_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
ALTER ROLE stockzen_app SET search_path TO public;

SELECT 'CREATE DATABASE stockzen_test'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'stockzen_test')\gexec
