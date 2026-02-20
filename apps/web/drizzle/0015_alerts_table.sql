CREATE TYPE "alert_level" AS ENUM ('red', 'orange', 'green');--> statement-breakpoint
CREATE TYPE "alert_status" AS ENUM ('active', 'closed');--> statement-breakpoint
CREATE TABLE "alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "level" "alert_level" NOT NULL,
  "status" "alert_status" NOT NULL DEFAULT 'active',
  "stock_at_creation" integer NOT NULL,
  "current_stock" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_alerts_one_active_per_product" ON "alerts" ("tenant_id", "product_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_alerts_tenant_status_level" ON "alerts" ("tenant_id", "status", "level");--> statement-breakpoint
CREATE INDEX "idx_alerts_tenant_updated" ON "alerts" ("tenant_id", "updated_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_alerts_product_id" ON "alerts" ("product_id");
