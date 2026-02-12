-- Migration: Add products table for Story 1.7
-- Product table with tenant scoping and RBAC-aware field structure

-- Create products table
CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "sku" varchar(100),
  "price" decimal(10, 2) NOT NULL DEFAULT 0,
  "purchase_price" decimal(10, 2),
  "quantity" integer NOT NULL DEFAULT 0,
  "low_stock_threshold" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for performance and lookups
CREATE INDEX IF NOT EXISTS "idx_products_tenant_id" ON "products"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_products_sku" ON "products"("sku");
CREATE INDEX IF NOT EXISTS "idx_products_name" ON "products"("name");

-- Enable Row Level Security
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tenant isolation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_isolation_select'
  ) THEN
    CREATE POLICY "products_isolation_select" ON "products"
      FOR SELECT USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_isolation_insert'
  ) THEN
    CREATE POLICY "products_isolation_insert" ON "products"
      FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_isolation_update'
  ) THEN
    CREATE POLICY "products_isolation_update" ON "products"
      FOR UPDATE USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      )
      WITH CHECK (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_isolation_delete'
  ) THEN
    CREATE POLICY "products_isolation_delete" ON "products"
      FOR DELETE USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
      );
  END IF;
END
$$;
