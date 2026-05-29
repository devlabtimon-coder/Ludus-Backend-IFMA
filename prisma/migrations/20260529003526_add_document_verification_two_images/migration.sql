/*
  Warnings:

  - You are about to drop the column `documentImage` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "documentImage",
ADD COLUMN     "documentBackImage" TEXT,
ADD COLUMN     "documentFrontImage" TEXT;
