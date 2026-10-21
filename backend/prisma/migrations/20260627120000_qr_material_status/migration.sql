-- QR lifecycle + material status columns that exist in schema.prisma but were
-- never captured in a migration (previously applied via `db push`). Guarded so
-- it is a no-op on databases that already have them.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MaterialStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "QRStatus" AS ENUM ('UNGENERATED', 'GENERATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Bay" ADD COLUMN IF NOT EXISTS "qrGeneratedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "qrStatus" "QRStatus" NOT NULL DEFAULT 'UNGENERATED',
ADD COLUMN IF NOT EXISTS "qrVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "status" "MaterialStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "MaterialLot" ADD COLUMN IF NOT EXISTS "qrGeneratedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "qrStatus" "QRStatus" NOT NULL DEFAULT 'UNGENERATED',
ADD COLUMN IF NOT EXISTS "qrVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Bay_qrCode_key" ON "Bay"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MaterialLot_qrCode_key" ON "MaterialLot"("qrCode");
