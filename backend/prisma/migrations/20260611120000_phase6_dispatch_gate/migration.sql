-- Phase 6 — Dispatch Validation + Exit Gate Validation
-- Adds the final operational control layer: a richer Dispatch lifecycle and a
-- new GateValidation entity, plus a mapping closure reason for dispatched lots.

-- 1. New enum values for existing types.
--    (Safe in a migration transaction on PG12+ since the new values are not
--     referenced within this same migration.)
ALTER TYPE "MappingStatus"  ADD VALUE IF NOT EXISTS 'DISPATCHED';
ALTER TYPE "DispatchStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "DispatchStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- 2. New enum type for gate validation lifecycle.
DO $$ BEGIN
  CREATE TYPE "GateValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'DENIED', 'EXITED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Rebuild the Dispatch table.
--    The original phase-1 Dispatch table was a placeholder with no service,
--    controller, route or UI — it carries no production data. Recreating it is
--    the cleanest way to adopt the full dispatch workflow shape without
--    column-by-column drift. Nothing references Dispatch via a DB constraint
--    yet, so this is safe.
DROP TABLE IF EXISTS "Dispatch" CASCADE;

CREATE TABLE "Dispatch" (
    "id"                TEXT NOT NULL,
    "dispatchNumber"    TEXT NOT NULL,
    "lotId"             TEXT NOT NULL,
    "bayId"             TEXT NOT NULL,
    "requestedQuantity" DOUBLE PRECISION NOT NULL,
    "approvedQuantity"  DOUBLE PRECISION,
    "requestedBy"       TEXT NOT NULL,
    "approvedBy"        TEXT,
    "dispatchStatus"    "DispatchStatus" NOT NULL DEFAULT 'PENDING',
    "vehicleNumber"     TEXT,
    "remarks"           TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt"        TIMESTAMP(3),
    "completedAt"       TIMESTAMP(3),
    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dispatch_dispatchNumber_key" ON "Dispatch"("dispatchNumber");
CREATE INDEX "Dispatch_lotId_idx"          ON "Dispatch"("lotId");
CREATE INDEX "Dispatch_bayId_idx"          ON "Dispatch"("bayId");
CREATE INDEX "Dispatch_dispatchStatus_idx" ON "Dispatch"("dispatchStatus");

ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_bayId_fkey"
  FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_requestedBy_fkey"
  FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_approvedBy_fkey"
  FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One open dispatch per lot at a time — blocks duplicate dispatch requests.
CREATE UNIQUE INDEX "Dispatch_lot_open_unique"
  ON "Dispatch"("lotId")
  WHERE "dispatchStatus" IN ('PENDING', 'APPROVED');

-- 4. GateValidation table.
CREATE TABLE "GateValidation" (
    "id"               TEXT NOT NULL,
    "dispatchId"       TEXT NOT NULL,
    "lotId"            TEXT NOT NULL,
    "bayId"            TEXT NOT NULL,
    "validatedBy"      TEXT,
    "validationStatus" "GateValidationStatus" NOT NULL DEFAULT 'PENDING',
    "gateExitTime"     TIMESTAMP(3),
    "remarks"          TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GateValidation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GateValidation_dispatchId_idx"       ON "GateValidation"("dispatchId");
CREATE INDEX "GateValidation_lotId_idx"            ON "GateValidation"("lotId");
CREATE INDEX "GateValidation_validationStatus_idx" ON "GateValidation"("validationStatus");

-- A dispatch can be EXITED at most once — blocks duplicate gate exits.
CREATE UNIQUE INDEX "GateValidation_dispatch_exited_unique"
  ON "GateValidation"("dispatchId")
  WHERE "validationStatus" = 'EXITED';

ALTER TABLE "GateValidation" ADD CONSTRAINT "GateValidation_dispatchId_fkey"
  FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GateValidation" ADD CONSTRAINT "GateValidation_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GateValidation" ADD CONSTRAINT "GateValidation_bayId_fkey"
  FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GateValidation" ADD CONSTRAINT "GateValidation_validatedBy_fkey"
  FOREIGN KEY ("validatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
