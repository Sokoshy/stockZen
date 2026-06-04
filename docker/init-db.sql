DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockzen_app') THEN
    CREATE ROLE stockzen_app WITH LOGIN PASSWORD 'stockzen_app_password';
  END IF;
END
$$;
ALTER ROLE stockzen_app SET search_path TO public;
