CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_memberships_tenant_user" ON "tenant_memberships" ("tenant_id", "user_id");
