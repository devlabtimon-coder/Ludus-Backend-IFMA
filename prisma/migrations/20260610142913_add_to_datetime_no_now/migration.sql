-- AlterTable
ALTER TABLE "GameCopy" ADD COLUMN     "isOriginal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Rental" ALTER COLUMN "startDate" DROP DEFAULT;
