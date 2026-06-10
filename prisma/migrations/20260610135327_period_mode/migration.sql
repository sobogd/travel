/*
  Warnings:

  - You are about to drop the column `tStart` on the `searches` table. All the data in the column will be lost.
  - Added the required column `dateFrom` to the `searches` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateTo` to the `searches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "searches" DROP COLUMN "tStart",
ADD COLUMN     "dateFrom" TEXT NOT NULL,
ADD COLUMN     "dateTo" TEXT NOT NULL;
