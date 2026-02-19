ALTER TABLE "tenants" ADD COLUMN "default_critical_threshold" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "default_attention_threshold" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "critical_positive" CHECK ("tenants"."default_critical_threshold" > 0);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "attention_positive" CHECK ("tenants"."default_attention_threshold" > 0);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "critical_less_than_attention" CHECK ("tenants"."default_critical_threshold" < "tenants"."default_attention_threshold");