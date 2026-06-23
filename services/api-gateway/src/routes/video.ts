import { Router } from "express";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../lib/db";

export const videoRouter = Router();

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_RAW_BUCKET!;

// GET /api/videos
videoRouter.get("/", async (_req, res) => {
  try {
    const videos = await db.video.findMany({
      orderBy: { createdAt: "desc" },
    });

    const videosWithUrls = await Promise.all(
      videos.map(async (video) => {
        if (!video.s3RawKey) return { ...video, playbackUrl: null };
        const playbackUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: BUCKET,
            Key: video.s3RawKey,
          }),
          { expiresIn: 3600 },
        );
        return { ...video, playbackUrl };
      }),
    );

    res.json(videosWithUrls);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// POST /api/videos
videoRouter.post("/", async (req, res) => {
  try {
    const schema = z.object({
      title: z.string(),
      description: z.string().optional(),
      s3Key: z.string(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { title, description, s3Key } = parsed.data;

    const video = await db.video.create({
      data: {
        title,
        description,
        s3RawKey: s3Key,
        status: "UPLOADING",
        userId: null,
      },
    });

    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ error: "Failed to save video" });
  }
});

// POST /api/videos/upload-url
videoRouter.post("/upload-url", async (req, res) => {
  try {
    const schema = z.object({
      fileName: z.string(),
      contentType: z.string(),
      fileSize: z.number().max(5_000_000_000),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { fileName, contentType, fileSize } = parsed.data;
    const videoId = crypto.randomUUID();
    const s3Key = `raw/${videoId}/${fileName}`;
    const presignedUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: contentType,
        ContentLength: fileSize,
      }),
      { expiresIn: 3600 },
    );
    res.json({ videoId, presignedUrl, s3Key });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});
