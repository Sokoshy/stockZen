-- Migration: Harden product RLS fail-safe behavior and index coverage

-- Ensure table owner is also constrained by tenant RLS policies.
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;

-- Align index coverage with tenant-scoped name lookups used by schema definitions.
CREATE INDEX IF NOT EXISTS "idx_products_tenant_name" ON "products"("tenant_id", "name");
