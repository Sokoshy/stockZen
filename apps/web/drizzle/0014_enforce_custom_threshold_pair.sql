ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "product_custom_critical_less_than_attention";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_custom_critical_less_than_attention" CHECK (
  (
    "products"."custom_critical_threshold" IS NULL
    AND "products"."custom_attention_threshold" IS NULL
  )
  OR (
    "products"."custom_critical_threshold" IS NOT NULL
    AND "products"."custom_attention_threshold" IS NOT NULL
    AND "products"."custom_critical_threshold" < "products"."custom_attention_threshold"
  )
);
