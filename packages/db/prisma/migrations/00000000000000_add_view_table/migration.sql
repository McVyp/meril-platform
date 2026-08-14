CREATE TABLE "View" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "viewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "View_videoId_idx" ON "View"("videoId");

CREATE INDEX "View_viewerId_idx" ON "View"("viewerId");
