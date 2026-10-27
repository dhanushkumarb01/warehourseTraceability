-- Inbound arrival mode, configurable warehouse locations and bay allocation.
--
-- Purely additive: new enums, new tables, nullable columns. Existing rows are
-- preserved; every existing Bay.zone label is backfilled into a Zone row and
-- linked through Bay.zoneId. No coordinates, connectivity or docks are
-- invented — those stay unconfigured (NULL / empty) until entered.

-- CreateEnum
CREATE TYPE "ArrivalMode" AS ENUM ('RAIL', 'ROAD');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ALLOCATED', 'PLACED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Bay" ADD COLUMN "zoneId" TEXT;

-- AlterTable
ALTER TABLE "MaterialLot" ADD COLUMN "arrivalMode" "ArrivalMode",
ADD COLUMN "arrivalRecordedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "railConnected" BOOLEAN,
    "roadConnected" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadingDock" (
    "id" TEXT NOT NULL,
    "dockCode" TEXT NOT NULL,
    "dockName" TEXT NOT NULL,
    "zoneId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "arrivalModes" "ArrivalMode"[] DEFAULT ARRAY[]::"ArrivalMode"[],
    "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadingDock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BayAllocation" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "bayId" TEXT NOT NULL,
    "loadingDockId" TEXT,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
    "arrivalMode" "ArrivalMode" NOT NULL,
    "recommendationRank" INTEGER,
    "straightLineDistanceM" DOUBLE PRECISION,
    "demandLevel" TEXT,
    "demandSource" TEXT,
    "method" TEXT,
    "remarks" TEXT,
    "allocatedBy" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placedMappingId" TEXT,
    "placedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BayAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");
CREATE UNIQUE INDEX "LoadingDock_dockCode_key" ON "LoadingDock"("dockCode");
CREATE INDEX "LoadingDock_zoneId_idx" ON "LoadingDock"("zoneId");
CREATE INDEX "LoadingDock_status_idx" ON "LoadingDock"("status");
CREATE UNIQUE INDEX "BayAllocation_placedMappingId_key" ON "BayAllocation"("placedMappingId");
CREATE INDEX "BayAllocation_lotId_idx" ON "BayAllocation"("lotId");
CREATE INDEX "BayAllocation_bayId_idx" ON "BayAllocation"("bayId");
CREATE INDEX "BayAllocation_status_idx" ON "BayAllocation"("status");
CREATE INDEX "Bay_zoneId_idx" ON "Bay"("zoneId");
CREATE INDEX "MaterialLot_arrivalMode_idx" ON "MaterialLot"("arrivalMode");

-- Database-level guarantee: a lot has AT MOST ONE open (ALLOCATED) allotment.
-- Partial index — not expressible in schema.prisma; the service enforces it too.
CREATE UNIQUE INDEX "BayAllocation_lot_open_unique"
  ON "BayAllocation"("lotId")
  WHERE "status" = 'ALLOCATED';

-- AddForeignKey
ALTER TABLE "LoadingDock" ADD CONSTRAINT "LoadingDock_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bay" ADD CONSTRAINT "Bay_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BayAllocation" ADD CONSTRAINT "BayAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BayAllocation" ADD CONSTRAINT "BayAllocation_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BayAllocation" ADD CONSTRAINT "BayAllocation_loadingDockId_fkey" FOREIGN KEY ("loadingDockId") REFERENCES "LoadingDock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BayAllocation" ADD CONSTRAINT "BayAllocation_allocatedBy_fkey" FOREIGN KEY ("allocatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BayAllocation" ADD CONSTRAINT "BayAllocation_placedMappingId_fkey" FOREIGN KEY ("placedMappingId") REFERENCES "MaterialBayMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one Zone per distinct existing Bay.zone label, then link the bays.
INSERT INTO "Zone" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, z."zone", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "zone" FROM "Bay") AS z
ON CONFLICT ("name") DO NOTHING;

UPDATE "Bay" AS b
SET "zoneId" = z."id"
FROM "Zone" AS z
WHERE z."name" = b."zone" AND b."zoneId" IS NULL;
