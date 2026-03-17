DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'subscription_plan'
  ) THEN
    CREATE TYPE "public"."subscription_plan" AS ENUM('Free', 'Starter', 'Pro');
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE "tenants"
ADD COLUMN IF NOT EXISTS "subscription_plan" "subscription_plan";
