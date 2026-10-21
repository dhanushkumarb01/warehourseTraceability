-- Phase 11 — AI Surveillance: Camera Management (foundation)
-- Purely additive. No existing tables/columns/constraints are modified.

CREATE TYPE "StreamType" AS ENUM ('RTSP', 'RTMP', 'HTTP', 'LOCAL_WEBCAM', 'UPLOADED_VIDEO');
CREATE TYPE "CameraStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
CREATE TYPE "CameraHealth" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

CREATE TABLE "Camera" (
    "id"                     TEXT NOT NULL,
    "cameraCode"             TEXT NOT NULL,
    "cameraName"             TEXT NOT NULL,
    "location"               TEXT NOT NULL,
    "cameraType"             TEXT NOT NULL,
    "cameraPurpose"          TEXT NOT NULL,
    "description"            TEXT,
    "streamType"             "StreamType" NOT NULL,
    "streamUrl"              TEXT,
    "username"               TEXT,
    "passwordEncrypted"      TEXT,
    "zone"                   TEXT NOT NULL,
    "site"                   TEXT,
    "status"                 "CameraStatus" NOT NULL DEFAULT 'ACTIVE',
    "health"                 "CameraHealth" NOT NULL DEFAULT 'UNKNOWN',
    "installationDate"       TIMESTAMP(3),
    "lastConnectivityCheck"  TIMESTAMP(3),
    "lastConnectivityResult" TEXT,
    "notes"                  TEXT,
    "config"                 JSONB,
    "aiConfig"               JSONB,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Camera_cameraCode_key" ON "Camera"("cameraCode");
CREATE INDEX "Camera_status_idx"     ON "Camera"("status");
CREATE INDEX "Camera_health_idx"     ON "Camera"("health");
CREATE INDEX "Camera_zone_idx"       ON "Camera"("zone");
CREATE INDEX "Camera_streamType_idx" ON "Camera"("streamType");
CREATE INDEX "Camera_site_idx"       ON "Camera"("site");
