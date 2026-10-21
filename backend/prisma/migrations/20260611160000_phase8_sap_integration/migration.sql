-- Phase 8 — SAP Integration Layer
-- Adds sync + validation logging. Additive and backward compatible.

CREATE TYPE "SAPSyncType" AS ENUM ('MATERIAL', 'INVENTORY', 'DISPATCH', 'STATUS');
CREATE TYPE "SAPSyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED');
CREATE TYPE "SAPValidationType" AS ENUM ('MATERIAL', 'LOT', 'INVENTORY', 'DISPATCH_APPROVAL', 'GATE_EXIT');
CREATE TYPE "SAPValidationStatus" AS ENUM ('VALIDATED', 'WARNING', 'BLOCKED');

CREATE TABLE "SAPSyncLog" (
    "id"              TEXT NOT NULL,
    "entityType"      "SAPSyncType" NOT NULL,
    "entityId"        TEXT NOT NULL,
    "syncType"        "SAPSyncType" NOT NULL,
    "status"          "SAPSyncStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload"  JSONB,
    "responsePayload" JSONB,
    "errorMessage"    TEXT,
    "attemptCount"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SAPSyncLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SAPSyncLog_entityType_idx" ON "SAPSyncLog"("entityType");
CREATE INDEX "SAPSyncLog_status_idx"     ON "SAPSyncLog"("status");
CREATE INDEX "SAPSyncLog_entityId_idx"   ON "SAPSyncLog"("entityId");

CREATE TABLE "SAPValidationLog" (
    "id"             TEXT NOT NULL,
    "entityType"     "SAPValidationType" NOT NULL,
    "entityId"       TEXT NOT NULL,
    "validationType" "SAPValidationType" NOT NULL,
    "status"         "SAPValidationStatus" NOT NULL,
    "message"        TEXT,
    "details"        JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SAPValidationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SAPValidationLog_entityType_idx" ON "SAPValidationLog"("entityType");
CREATE INDEX "SAPValidationLog_status_idx"     ON "SAPValidationLog"("status");
CREATE INDEX "SAPValidationLog_entityId_idx"   ON "SAPValidationLog"("entityId");
