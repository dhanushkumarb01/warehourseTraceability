-- Phase 13 — AI Surveillance: reusable alert system (first detector: motion)
-- Purely additive. No existing tables, columns, constraints, or data are modified.
-- Per-camera detector config lives in the existing Camera.aiConfig (JSONB).

-- ── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "SurveillanceAlertType" AS ENUM (
    'MOTION', 'INTRUSION', 'WALL_INTRUSION', 'FACE', 'GEOFENCE',
    'VEHICLE', 'OVERSPEED', 'DRIVER_MONITORING', 'OTHER'
);
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "AlertStatus"   AS ENUM ('NEW', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- ── SurveillanceAlert ───────────────────────────────────────────────────────
CREATE TABLE "SurveillanceAlert" (
    "id"               TEXT NOT NULL,
    "alertType"        "SurveillanceAlertType" NOT NULL,
    "detectorType"     TEXT NOT NULL,
    "cameraId"         TEXT NOT NULL,
    "location"         TEXT NOT NULL,
    "severity"         "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status"           "AlertStatus" NOT NULL DEFAULT 'NEW',
    "message"          TEXT NOT NULL,
    "snapshotPath"     TEXT,
    "clipPath"         TEXT,
    "detectionDetails" JSONB,
    "detectedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedBy"   TEXT,
    "acknowledgedAt"   TIMESTAMP(3),
    "resolvedBy"       TEXT,
    "resolvedAt"       TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveillanceAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SurveillanceAlert_cameraId_idx"          ON "SurveillanceAlert"("cameraId");
CREATE INDEX "SurveillanceAlert_alertType_idx"         ON "SurveillanceAlert"("alertType");
CREATE INDEX "SurveillanceAlert_status_idx"            ON "SurveillanceAlert"("status");
CREATE INDEX "SurveillanceAlert_severity_idx"          ON "SurveillanceAlert"("severity");
CREATE INDEX "SurveillanceAlert_detectedAt_idx"        ON "SurveillanceAlert"("detectedAt");
CREATE INDEX "SurveillanceAlert_detectorType_idx"      ON "SurveillanceAlert"("detectorType");
CREATE INDEX "SurveillanceAlert_status_severity_idx"   ON "SurveillanceAlert"("status", "severity");

ALTER TABLE "SurveillanceAlert"
    ADD CONSTRAINT "SurveillanceAlert_cameraId_fkey"
    FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
