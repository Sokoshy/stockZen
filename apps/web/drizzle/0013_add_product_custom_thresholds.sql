ALTER TABLE "products" ADD COLUMN "custom_critical_threshold" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "custom_attention_threshold" integer;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_custom_critical_positive" CHECK ("products"."custom_critical_threshold" IS NULL OR "products"."custom_critical_threshold" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_custom_attention_positive" CHECK ("products"."custom_attention_threshold" IS NULL OR "products"."custom_attention_threshold" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_custom_critical_less_than_attention" CHECK ("products"."custom_critical_threshold" IS NULL OR "products"."custom_attention_threshold" IS NULL OR "products"."custom_critical_threshold" < "products"."custom_attention_threshold");
