/*
  Warnings:

  - A unique constraint covering the columns `[matricula]` on the table `PendingRegistration` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[matricula]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "matricula" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "academicVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "isAcademicVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "matricula" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_matricula_key" ON "PendingRegistration"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "User_matricula_key" ON "User"("matricula");
