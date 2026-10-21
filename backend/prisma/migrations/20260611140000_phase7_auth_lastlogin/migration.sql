-- Phase 7 — Authentication & RBAC
-- Adds a lastLogin timestamp to User. Additive and backward compatible.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);
