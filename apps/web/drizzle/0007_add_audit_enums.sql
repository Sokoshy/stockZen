-- Migration: Create PostgreSQL enums for audit_events
-- Create proper enum types for audit action types and status

-- Create enum types if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action_type') THEN
    CREATE TYPE audit_action_type AS ENUM (
      'login',
      'logout',
      'password_reset_completed',
      'invite_created',
      'invite_revoked',
      'role_changed',
      'member_removed',
      'login_failed',
      'forbidden_attempt'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_status') THEN
    CREATE TYPE audit_status AS ENUM ('success', 'failure');
  END IF;
END
$$;

-- Alter table to use enum types
ALTER TABLE "audit_events" 
  ALTER COLUMN "action_type" TYPE audit_action_type 
  USING "action_type"::audit_action_type;

ALTER TABLE "audit_events" 
  ALTER COLUMN "status" TYPE audit_status 
  USING "status"::audit_status;
