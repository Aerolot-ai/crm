-- AlterTable
ALTER TABLE "company" ADD COLUMN     "aerolotDealerId" TEXT,
ADD COLUMN     "aerolotProvisionStatus" TEXT,
ADD COLUMN     "aerolotProvisionError" TEXT,
ADD COLUMN     "aerolotPortalUrl" TEXT,
ADD COLUMN     "aerolotProvisionedAt" TIMESTAMP(3),
ADD COLUMN     "aerolotProvisionSource" TEXT;

-- CreateIndex
CREATE INDEX "company_aerolotDealerId_idx" ON "company"("aerolotDealerId");
