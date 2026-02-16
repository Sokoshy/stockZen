-- Migration: add stock movements ledger for Story 2.3

DO $$
BEGIN
  CREATE TYPE "public"."movement_type" AS ENUM ('entry', 'exit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "type" "movement_type" NOT NULL,
  "quantity" integer NOT NULL,
  "idempotency_key" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_movements_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "public"."stock_movements"
      ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_movements_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "public"."stock_movements"
      ADD CONSTRAINT "stock_movements_product_id_products_id_fk"
      FOREIGN KEY ("product_id") REFERENCES "public"."products"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_movements_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "public"."stock_movements"
      ADD CONSTRAINT "stock_movements_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "idx_stock_movements_tenant_id" ON "public"."stock_movements" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_product_id" ON "public"."stock_movements" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_tenant_product" ON "public"."stock_movements" USING btree ("tenant_id", "product_id");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_created_at" ON "public"."stock_movements" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_idempotency" ON "public"."stock_movements" USING btree ("tenant_id", "idempotency_key");

ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stock_movements'
      AND policyname = 'stock_movements_tenant_isolation'
  ) THEN
    CREATE POLICY "stock_movements_tenant_isolation"
      ON "public"."stock_movements"
      FOR ALL
      TO public
      USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END
$$;
