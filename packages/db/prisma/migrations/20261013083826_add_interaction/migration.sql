-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "videoId" TEXT NOT NULL,
    "watchedDuration" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_eventId_key" ON "Interaction"("eventId");

-- CreateIndex
CREATE INDEX "Interaction_userId_occurredAt_idx" ON "Interaction"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_sessionId_occurredAt_idx" ON "Interaction"("sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_videoId_occurredAt_idx" ON "Interaction"("videoId", "occurredAt");
