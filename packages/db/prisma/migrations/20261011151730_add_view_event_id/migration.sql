/*
  Warnings:

  - A unique constraint covering the columns `[eventId]` on the table `View` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "View" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "View_eventId_key" ON "View"("eventId");
