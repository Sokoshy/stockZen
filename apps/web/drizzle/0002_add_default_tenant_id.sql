-- Migration: Add default tenant reference to user
-- Created for Story 1.2 fixes: establish tenant context per user

ALTER TABLE "user"
  ADD COLUMN "default_tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL;

CREATE INDEX "idx_user_default_tenant_id" ON "user"("default_tenant_id");
