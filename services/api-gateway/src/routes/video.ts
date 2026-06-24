import { Router } from "express";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../lib/db";
import { getTemporalClient } from "../lib/temporal";

export const videoRouter = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
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
        status: "PROCESSING",
        userId: null,
      },
    });

    // trigger Temporal transcoding workflow
    try {
      const temporal = await getTemporalClient();
      await temporal.workflow.start("TranscodeWorkflow", {
        args: [s3Key],
        taskQueue: "media-processor",
        workflowId: `transcode-${video.id}`,
      });
    } catch (temporalErr) {
      console.error("Failed to start transcode workflow:", temporalErr);
    }

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

    const { fileName, contentType } = parsed.data;
    const videoId = crypto.randomUUID();
    const s3Key = `raw/${videoId}/${fileName}`;
    // ContentLength omitted intentionally — including it triggers CRC32 checksum
    // requirement from AWS SDK v3 which browser XHR cannot satisfy.
    const presignedUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 },
    );
    res.json({ videoId, presignedUrl, s3Key });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// GET /api/videos/:id/status
videoRouter.get("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    const video = await db.video.findUnique({ where: { id } });
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    // Already settled — return immediately without hitting Temporal
    if (video.status === "READY" || video.status === "FAILED") {
      res.json({ status: video.status, hlsUrl: video.hlsUrl });
      return;
    }

    // Check live Temporal workflow status
    const temporal = await getTemporalClient();
    const handle = temporal.workflow.getHandle(`transcode-${id}`);

    let desc;
    try {
      desc = await handle.describe();
    } catch (err: any) {
      // Workflow not found — return whatever DB has
      if (err.name === "WorkflowNotFoundError") {
        res.json({ status: video.status, hlsUrl: video.hlsUrl });
        return;
      }
      throw err;
    }

    const wfStatus = desc.status.name;

    if (wfStatus === "COMPLETED") {
      const hlsKey = await handle.result(); // "hls/{id}/master.m3u8"
      const hlsUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${hlsKey}`;
      await db.video.update({
        where: { id },
        data: { status: "READY", hlsUrl },
      });
      res.json({ status: "READY", hlsUrl });
      return;
    }

    if (
      wfStatus === "FAILED" ||
      wfStatus === "TIMED_OUT" ||
      wfStatus === "CANCELLED"
    ) {
      await db.video.update({ where: { id }, data: { status: "FAILED" } });
      res.json({ status: "FAILED", hlsUrl: null });
      return;
    }
    res.json({ status: "PROCESSING", hlsUrl: null });
  } catch (err) {
    res.status(500).json({ error: "Failed to get video status" });
  }
});
