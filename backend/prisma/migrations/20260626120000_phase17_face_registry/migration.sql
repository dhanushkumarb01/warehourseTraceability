-- Phase 14 (platform phase 17) — AI Surveillance: Face Detection & Registry
-- Additive: employee face registry + one new SurveillanceAlertType value.
-- The reusable SurveillanceAlert model and per-camera aiConfig already support
-- the FACE_DETECTION use case — only the registry tables and label are new.

ALTER TYPE "SurveillanceAlertType" ADD VALUE IF NOT EXISTS 'FACE_DETECTION';

-- ── Employee ────────────────────────────────────────────────────────────────
CREATE TABLE "Employee" (
    "id"           TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "department"   TEXT,
    "designation"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- ── EmployeeFace ────────────────────────────────────────────────────────────
CREATE TABLE "EmployeeFace" (
    "id"         TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "embedding"  JSONB NOT NULL,
    "model"      TEXT NOT NULL DEFAULT 'insightface',
    "quality"    DOUBLE PRECISION,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeFace_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeFace_employeeId_idx" ON "EmployeeFace"("employeeId");

ALTER TABLE "EmployeeFace"
    ADD CONSTRAINT "EmployeeFace_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
