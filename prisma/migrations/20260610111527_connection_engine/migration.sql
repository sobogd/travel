/*
  Warnings:

  - You are about to drop the column `currency` on the `searches` table. All the data in the column will be lost.
  - You are about to drop the column `dateFrom` on the `searches` table. All the data in the column will be lost.
  - You are about to drop the column `dateTo` on the `searches` table. All the data in the column will be lost.
  - Added the required column `maxDistKm` to the `searches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxLayoverMin` to the `searches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tStart` to the `searches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "searches" DROP COLUMN "currency",
DROP COLUMN "dateFrom",
DROP COLUMN "dateTo",
ADD COLUMN     "maxDistKm" INTEGER NOT NULL,
ADD COLUMN     "maxLayoverMin" INTEGER NOT NULL,
ADD COLUMN     "tStart" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "fids_cache" (
    "id" TEXT NOT NULL,
    "airportCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "half" TEXT NOT NULL,
    "flights" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fids_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fids_cache_airportCode_direction_date_half_key" ON "fids_cache"("airportCode", "direction", "date", "half");
