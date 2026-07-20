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
import { requireAuth } from "../middleware/auth";
import { requireDbUser } from "../middleware/requireDbUser";

export const videoRouter = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const BUCKET = process.env.S3_RAW_BUCKET!;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// public — anyone can browse the video catalog. Cursor-paginated via ?cursor=<videoId>&limit=n.
videoRouter.get("/", async (req, res) => {
  try {
    const querySchema = z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { cursor, limit = DEFAULT_PAGE_SIZE } = parsed.data;

    const videos = await db.video.findMany({
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = videos.length > limit;
    const page = hasMore ? videos.slice(0, limit) : videos;

    const videosWithUrls = await Promise.all(
      page.map(async (video) => {
        if (!video.s3RawKey) return { ...video, playbackUrl: null };
        const playbackUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: video.s3RawKey }),
          { expiresIn: 3600 },
        );
        return { ...video, playbackUrl };
      }),
    );

    res.json({
      videos: videosWithUrls,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

videoRouter.post(
  "/upload-url",
  requireAuth,
  requireDbUser,
  async (req, res) => {
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
  },
);

videoRouter.get("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    const video = await db.video.findUnique({ where: { id } });
    if (!video) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    if (video.status === "READY" || video.status === "FAILED") {
      res.json({ status: video.status, hlsUrl: video.hlsUrl });
      return;
    }

    const temporal = await getTemporalClient();
    const handle = temporal.workflow.getHandle(`transcode-${id}`);

    let desc;
    try {
      desc = await handle.describe();
    } catch (err: any) {
      if (err.name === "WorkflowNotFoundError") {
        res.json({ status: video.status, hlsUrl: video.hlsUrl });
        return;
      }
      throw err;
    }

    const wfStatus = desc.status.name;

    if (wfStatus === "COMPLETED") {
      const hlsKey = await handle.result();
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

// videoId comes from the same uuid generated in POST /upload-url
videoRouter.post("/", requireAuth, requireDbUser, async (req, res) => {
  try {
    const schema = z.object({
      videoId: z.string().uuid(),
      title: z.string(),
      description: z.string().optional(),
      s3Key: z.string(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { videoId, title, description, s3Key } = parsed.data;
    const userId = req.dbUser!.id;

    const existing = await db.video.findUnique({ where: { id: videoId } });
    if (existing) {
      if (existing.userId !== userId) {
        res.status(409).json({ error: "videoId already in use" });
        return;
      }
      res.status(200).json(existing);
      return;
    }

    let video;
    try {
      video = await db.video.create({
        data: {
          id: videoId,
          title,
          description,
          s3RawKey: s3Key,
          status: "PROCESSING",
          userId,
        },
      });
    } catch (err: any) {
      // Race: two concurrent requests with the same videoId both passed
      // the findUnique check above before either create() landed.
      if (err.code === "P2002") {
        const raced = await db.video.findUnique({ where: { id: videoId } });
        if (raced) {
          res.status(200).json(raced);
          return;
        }
      }
      throw err;
    }

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
    console.error("POST /api/videos error:", err);
    res.status(500).json({ error: "Failed to save video" });
  }
});
