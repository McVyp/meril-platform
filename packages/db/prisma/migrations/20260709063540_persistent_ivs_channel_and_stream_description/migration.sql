/*
  Warnings:

  - You are about to drop the column `channelArn` on the `Stream` table. All the data in the column will be lost.
  - You are about to drop the column `playbackUrl` on the `Stream` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Stream" DROP COLUMN "channelArn",
DROP COLUMN "playbackUrl",
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ivsChannelArn" TEXT,
ADD COLUMN     "ivsIngestEndpoint" TEXT,
ADD COLUMN     "ivsPlaybackUrl" TEXT,
ADD COLUMN     "ivsStreamKey" TEXT;
