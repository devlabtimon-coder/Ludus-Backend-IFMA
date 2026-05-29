/*
  Warnings:

  - A unique constraint covering the columns `[cpf]` on the table `PendingRegistration` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "address" TEXT,
ADD COLUMN     "cpf" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PendingRegistration_cpf_key" ON "PendingRegistration"("cpf");
