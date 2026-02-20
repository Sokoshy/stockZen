ALTER TABLE "alerts" ADD COLUMN "handled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_alerts_tenant_snoozed" ON "alerts" ("tenant_id", "snoozed_until") WHERE "snoozed_until" IS NOT NULL AND "status" = 'active';
