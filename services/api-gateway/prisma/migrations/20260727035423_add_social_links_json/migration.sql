/*
  Warnings:

  - You are about to drop the column `instagramUrl` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twitterUrl` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `websiteUrl` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "instagramUrl",
DROP COLUMN "twitterUrl",
DROP COLUMN "websiteUrl",
ADD COLUMN     "socialLinks" JSONB;
