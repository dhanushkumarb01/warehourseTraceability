-- Phase 12 — Live Camera Streaming Infrastructure
-- Purely additive. No existing tables, columns, constraints, or data are modified.
-- Adds fine-grained live-stream state to Camera and an append-only connection log.

-- ── New enum ────────────────────────────────────────────────────────────────
CREATE TYPE "StreamStatus" AS ENUM ('OFFLINE', 'CONNECTING', 'ONLINE', 'RECONNECTING', 'ERROR');

-- ── Camera: additive stream columns ─────────────────────────────────────────
ALTER TABLE "Camera" ADD COLUMN "streamStatus"       "StreamStatus" NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE "Camera" ADD COLUMN "lastConnectedAt"    TIMESTAMP(3);
ALTER TABLE "Camera" ADD COLUMN "lastDisconnectedAt" TIMESTAMP(3);
ALTER TABLE "Camera" ADD COLUMN "lastStreamAt"       TIMESTAMP(3);
ALTER TABLE "Camera" ADD COLUMN "resolution"         TEXT;
ALTER TABLE "Camera" ADD COLUMN "fps"                INTEGER;
ALTER TABLE "Camera" ADD COLUMN "videoFilePath"      TEXT;
ALTER TABLE "Camera" ADD COLUMN "videoFileName"      TEXT;

CREATE INDEX "Camera_streamStatus_idx" ON "Camera"("streamStatus");

-- ── CameraStreamLog: append-only lifecycle trail ────────────────────────────
CREATE TABLE "CameraStreamLog" (
    "id"        TEXT NOT NULL,
    "cameraId"  TEXT NOT NULL,
    "event"     TEXT NOT NULL,
    "status"    "StreamStatus" NOT NULL,
    "message"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CameraStreamLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CameraStreamLog_cameraId_idx"           ON "CameraStreamLog"("cameraId");
CREATE INDEX "CameraStreamLog_cameraId_createdAt_idx" ON "CameraStreamLog"("cameraId", "createdAt");
CREATE INDEX "CameraStreamLog_event_idx"              ON "CameraStreamLog"("event");

ALTER TABLE "CameraStreamLog"
    ADD CONSTRAINT "CameraStreamLog_cameraId_fkey"
    FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
