-- Phase 10 — Truck Traceability + RFID Lifecycle
-- Purely additive. No existing tables, columns or constraints are modified.

CREATE TYPE "TruckStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "VisitStatus" AS ENUM ('ACTIVE', 'PARKED', 'EXITED');
CREATE TYPE "TruckStage" AS ENUM ('ENTRY_GATE', 'WEIGH_BRIDGE_1', 'LOADING_DOCK', 'WEIGH_BRIDGE_2', 'INVOICE', 'PARKING', 'EXIT_GATE');
CREATE TYPE "TruckAlertType" AS ENUM ('DELAY', 'SEQUENCE_VIOLATION', 'UNAUTHORIZED_REENTRY');
CREATE TYPE "RFIDReaderStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

CREATE TABLE "Truck" (
    "id"            TEXT NOT NULL,
    "truckNumber"   TEXT NOT NULL,
    "driverName"    TEXT NOT NULL,
    "driverContact" TEXT,
    "transporter"   TEXT,
    "vehicleType"   TEXT,
    "rfidTag"       TEXT,
    "status"        "TruckStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Truck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Truck_truckNumber_key" ON "Truck"("truckNumber");
CREATE UNIQUE INDEX "Truck_rfidTag_key" ON "Truck"("rfidTag");
CREATE INDEX "Truck_status_idx" ON "Truck"("status");

CREATE TABLE "RFIDReader" (
    "id"            TEXT NOT NULL,
    "readerCode"    TEXT NOT NULL,
    "readerName"    TEXT NOT NULL,
    "readerType"    TEXT NOT NULL DEFAULT 'FIXED',
    "stage"         "TruckStage" NOT NULL,
    "ipAddress"     TEXT,
    "location"      TEXT,
    "status"        "RFIDReaderStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastHeartbeat" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RFIDReader_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RFIDReader_readerCode_key" ON "RFIDReader"("readerCode");
CREATE INDEX "RFIDReader_stage_idx" ON "RFIDReader"("stage");
CREATE INDEX "RFIDReader_status_idx" ON "RFIDReader"("status");

CREATE TABLE "TruckVisit" (
    "id"           TEXT NOT NULL,
    "visitNumber"  TEXT NOT NULL,
    "truckId"      TEXT NOT NULL,
    "status"       "VisitStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStage" "TruckStage",
    "riskStatus"   TEXT NOT NULL DEFAULT 'NORMAL',
    "invoiceAt"    TIMESTAMP(3),
    "entryTime"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitTime"     TIMESTAMP(3),
    "dispatchId"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TruckVisit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TruckVisit_visitNumber_key" ON "TruckVisit"("visitNumber");
CREATE INDEX "TruckVisit_truckId_idx" ON "TruckVisit"("truckId");
CREATE INDEX "TruckVisit_status_idx" ON "TruckVisit"("status");
CREATE INDEX "TruckVisit_currentStage_idx" ON "TruckVisit"("currentStage");
CREATE INDEX "TruckVisit_dispatchId_idx" ON "TruckVisit"("dispatchId");

CREATE TABLE "TruckEvent" (
    "id"        TEXT NOT NULL,
    "visitId"   TEXT NOT NULL,
    "truckId"   TEXT NOT NULL,
    "stage"     "TruckStage" NOT NULL,
    "readerId"  TEXT,
    "source"    TEXT NOT NULL DEFAULT 'SIMULATED',
    "rawTag"    TEXT,
    "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TruckEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TruckEvent_visitId_idx" ON "TruckEvent"("visitId");
CREATE INDEX "TruckEvent_truckId_idx" ON "TruckEvent"("truckId");
CREATE INDEX "TruckEvent_stage_idx" ON "TruckEvent"("stage");

CREATE TABLE "TruckAlert" (
    "id"        TEXT NOT NULL,
    "visitId"   TEXT NOT NULL,
    "truckId"   TEXT NOT NULL,
    "alertType" "TruckAlertType" NOT NULL,
    "stage"     "TruckStage",
    "message"   TEXT NOT NULL,
    "resolved"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TruckAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TruckAlert_visitId_idx" ON "TruckAlert"("visitId");
CREATE INDEX "TruckAlert_alertType_idx" ON "TruckAlert"("alertType");
CREATE INDEX "TruckAlert_resolved_idx" ON "TruckAlert"("resolved");

ALTER TABLE "TruckVisit" ADD CONSTRAINT "TruckVisit_truckId_fkey"
  FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TruckEvent" ADD CONSTRAINT "TruckEvent_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "TruckVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TruckEvent" ADD CONSTRAINT "TruckEvent_readerId_fkey"
  FOREIGN KEY ("readerId") REFERENCES "RFIDReader"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TruckAlert" ADD CONSTRAINT "TruckAlert_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "TruckVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
