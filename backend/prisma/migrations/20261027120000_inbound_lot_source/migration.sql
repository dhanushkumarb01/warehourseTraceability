-- Inbound consignments from FOIS / SAP.
--
-- Purely additive: one enum, three columns, one unique index. Existing lots
-- are backfilled as MANUAL by the column default; externalRef stays NULL for
-- them. Postgres treats NULLs as distinct in a unique index, so any number of
-- manual lots remain allowed while (FOIS|SAP, externalRef) can exist once —
-- the database-level guarantee that a consignment is never imported twice.

-- CreateEnum
CREATE TYPE "LotSource" AS ENUM ('MANUAL', 'FOIS', 'SAP');

-- AlterTable
ALTER TABLE "MaterialLot" ADD COLUMN     "externalMeta" JSONB,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "source" "LotSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE UNIQUE INDEX "MaterialLot_source_externalRef_key" ON "MaterialLot"("source", "externalRef");
