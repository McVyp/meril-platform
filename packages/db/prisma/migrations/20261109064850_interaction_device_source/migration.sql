-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "browser" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "deviceType" TEXT,
ADD COLUMN     "os" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "Interaction_occurredAt_idx" ON "Interaction"("occurredAt");
