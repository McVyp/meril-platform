-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessedEvent_receivedAt_idx" ON "ProcessedEvent"("receivedAt");
