-- Migration: Rename "user" table to "users" (reserved keyword conflict in PostgreSQL)

ALTER TABLE "user" RENAME TO "users";
