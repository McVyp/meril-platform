-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "topic" TEXT;
