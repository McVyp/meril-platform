import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { requireDbUser } from "../../middleware/requireDbUser";
import { rateLimit } from "../../middleware/rateLimit";
import { CreateStreamBody, PatchStreamBody } from "../../types/stream";
import { db } from "../../lib/db";
import { ivs } from "../../lib/ivs";
import { ivschat } from "../../lib/ivschat";
import { CreateChannelCommand, GetStreamCommand } from "@aws-sdk/client-ivs";
import { CreateRoomCommand } from "@aws-sdk/client-ivschat";
import { reconcileActiveStreams } from "../../lib/streamReconcile";
import { errorMessage } from "../../lib/errors";

export const browserRouter = Router();
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
// IVS channel is provisioned once per user and reused for every stream after.
browserRouter.post(
  "/",
  requireAuth,
  requireDbUser,
  rateLimit({
    windowSeconds: 60,
    maxRequests: 3,
    keyPrefix: "desktop-stream",
  }),
  async (req: Request<{}, {}, CreateStreamBody>, res: Response) => {
    const { title, description } = req.body;
    const userId = req.dbUser!.id;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    try {
      let user = req.dbUser!;

      if (!user.ivsChannelArn) {
        const command = new CreateChannelCommand({
          name: `meril-${userId}`,
          latencyMode: "LOW",
          type: "STANDARD",
        });

        const { channel, streamKey } = await ivs.send(command);

        if (
          !channel?.arn ||
          !channel?.ingestEndpoint ||
          !channel?.playbackUrl ||
          !streamKey?.value
        ) {
          res
            .status(500)
            .json({ error: "IVS channel creation returned incomplete data" });
          return;
        }

        user = await db.user.update({
          where: { id: userId },
          data: {
            ivsChannelArn: channel.arn,
            ivsIngestEndpoint: `rtmps://${channel.ingestEndpoint}:443/app/`,
            ivsPlaybackUrl: channel.playbackUrl,
            ivsStreamKey: streamKey.value,
          },
        });
      }

      // Close out prior in-flight rows so an abandoned one can't resurface via GET /mine later.
      await db.stream.updateMany({
        where: { userId, status: { in: ["OFFLINE", "LIVE"] } },
        data: { status: "ENDED", endedAt: new Date() },
      });

      if (!user.ivsChatRoomArn) {
        const chatRoom = await ivschat.send(
          new CreateRoomCommand({ name: `meril-chat-${userId}` }),
        );

        if (!chatRoom.arn) {
          res
            .status(500)
            .json({ error: "IVS Chat room creation returned no ARN" });
          return;
        }

        user = await db.user.update({
          where: { id: userId },
          data: { ivsChatRoomArn: chatRoom.arn },
        });
      }

      const stream = await db.stream.create({
        data: {
          title,
          description: description ?? null,
          userId,
          status: "OFFLINE",
        },
      });

      res.status(201).json({
        stream: { ...stream, playbackUrl: user.ivsPlaybackUrl },
        ingestEndpoint: user.ivsIngestEndpoint,
        streamKey: user.ivsStreamKey,
      });
    } catch (err) {
      console.error("POST /api/streams error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

browserRouter.get("/", async (req: Request, res: Response) => {
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

    const reconciled = await reconcileActiveStreams();

    const streams = await db.stream.findMany({
      where: {
        OR: [
          { status: { not: "OFFLINE" } },
          {
            status: "OFFLINE",
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        user: {
          select: { ivsPlaybackUrl: true, ivsChannelArn: true, name: true },
        },
      },
    });

    const hasMore = streams.length > limit;
    const page = hasMore ? streams.slice(0, limit) : streams;

    const withStatus = page.map((s) => {
      const r = reconciled.get(s.id);
      return {
        ...s,
        status: r?.status ?? s.status,
        playbackUrl: r?.playbackUrl ?? s.user.ivsPlaybackUrl,
      };
    });

    res.json({
      streams: withStatus,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error("GET /api/streams error:", err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

// rehydrates the studio page's own stream state after a reload.
browserRouter.get(
  "/mine",
  requireAuth,
  requireDbUser,
  async (req: Request, res: Response) => {
    const userId = req.dbUser!.id;
    const user = req.dbUser!;

    try {
      const stream = await db.stream.findFirst({
        where: { userId, status: { in: ["OFFLINE", "LIVE"] } },
        orderBy: { createdAt: "desc" },
      });

      if (!stream) {
        res.json({ stream: null });
        return;
      }

      if (user.ivsChannelArn && stream.status !== "LIVE") {
        try {
          const { stream: ivsStream } = await ivs.send(
            new GetStreamCommand({ channelArn: user.ivsChannelArn }),
          );
          if (ivsStream?.state === "LIVE") {
            await db.stream.update({
              where: { id: stream.id },
              data: { status: "LIVE", startedAt: new Date() },
            });
            stream.status = "LIVE";
          }
        } catch {}
      }

      res.json({
        stream: {
          id: stream.id,
          title: stream.title,
          description: stream.description,
          status: stream.status,
          playbackUrl: user.ivsPlaybackUrl,
          ingestEndpoint: user.ivsIngestEndpoint,
          streamKey: user.ivsStreamKey,
        },
      });
    } catch (err) {
      console.error("GET /api/streams/mine error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

browserRouter.get("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    const stream = await db.stream.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            ivsPlaybackUrl: true,
            ivsChannelArn: true,
          },
        },
      },
    });

    if (!stream) {
      res.status(404).json({ error: "Stream not found" });
      return;
    }

    if (stream.user.ivsChannelArn) {
      try {
        const { stream: ivsStream } = await ivs.send(
          new GetStreamCommand({ channelArn: stream.user.ivsChannelArn }),
        );

        if (ivsStream?.state === "LIVE" && stream.status !== "LIVE") {
          await db.stream.update({
            where: { id },
            data: { status: "LIVE", startedAt: new Date() },
          });
          stream.status = "LIVE";
        }
      } catch {}
    }

    const { ivsChannelArn, ...safeUser } = stream.user;

    res.json({
      ...stream,
      user: safeUser,
      playbackUrl: stream.user.ivsPlaybackUrl,
    });
  } catch (err) {
    console.error("GET /api/streams/:id error:", err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

browserRouter.patch(
  "/:id",
  requireAuth,
  requireDbUser,
  async (req: Request<{ id: string }, {}, PatchStreamBody>, res: Response) => {
    const id = req.params.id as string;
    const { title, description } = req.body;

    try {
      const existing = await db.stream.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ error: "Stream not found" });
        return;
      }
      if (existing.userId !== req.dbUser!.id) {
        res.status(403).json({ error: "You don't own this stream" });
        return;
      }

      const stream = await db.stream.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
        },
      });
      res.json({ stream });
    } catch (err) {
      console.error("PATCH /api/streams/:id error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);
