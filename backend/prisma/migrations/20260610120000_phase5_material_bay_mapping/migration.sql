-- Phase 5 — Material to Bay Mapping
-- Extends the existing MaterialBayMapping table created in phase 1 to support
-- explicit removal (UNMAPPED), a closure timestamp, an update timestamp and the
-- indexes / integrity constraints required by the inventory & traceability flows.

-- 1. New mapping lifecycle state: explicit removal from a bay.
ALTER TYPE "MappingStatus" ADD VALUE IF NOT EXISTS 'UNMAPPED';

-- 2. Closure timestamp — null while ACTIVE, set when MOVED or UNMAPPED.
ALTER TABLE "MaterialBayMapping" ADD COLUMN IF NOT EXISTS "unmappedAt" TIMESTAMP(3);

-- 3. updatedAt — required (NOT NULL) by Prisma @updatedAt.
--    Default backfills existing rows; Prisma keeps it current on writes.
ALTER TABLE "MaterialBayMapping"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Read accelerators for inventory / history / location lookups.
CREATE INDEX IF NOT EXISTS "MaterialBayMapping_lotId_idx"        ON "MaterialBayMapping"("lotId");
CREATE INDEX IF NOT EXISTS "MaterialBayMapping_bayId_idx"        ON "MaterialBayMapping"("bayId");
CREATE INDEX IF NOT EXISTS "MaterialBayMapping_status_idx"       ON "MaterialBayMapping"("status");
CREATE INDEX IF NOT EXISTS "MaterialBayMapping_bayId_status_idx" ON "MaterialBayMapping"("bayId", "status");

-- 5. Database-level guarantee: a lot can have AT MOST ONE active mapping.
--    A lot can never physically exist in two bays simultaneously. This is a
--    partial unique index (Prisma cannot express it in schema.prisma, so it is
--    declared here directly — the application layer enforces it too).
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialBayMapping_lot_active_unique"
  ON "MaterialBayMapping"("lotId")
  WHERE "status" = 'ACTIVE';
