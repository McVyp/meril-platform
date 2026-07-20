import { Router, Request, Response } from "express";
import {
  CreateChannelCommand,
  GetStreamCommand,
  StopStreamCommand,
} from "@aws-sdk/client-ivs";
import { ivs } from "../lib/ivs";
import { db } from "../lib/db";
import { broadcastToRoom } from "../lib/ws";
import {
  CreateChatTokenCommand,
  CreateRoomCommand,
} from "@aws-sdk/client-ivschat";
import { ivschat } from "../lib/ivschat";
import {
  CreateStreamBody,
  PatchStreamBody,
  EventBridgeIvsEvent,
} from "../types/stream";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { requireDbUser } from "../middleware/requireDbUser";
import { z } from "zod";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export const streamRouter = Router();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

// IVS channel is provisioned once per user and reused for every stream after.
streamRouter.post(
  "/",
  requireAuth,
  requireDbUser,
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

async function reconcileActiveStreams(): Promise<
  Map<string, { status: string; playbackUrl: string | null }>
> {
  const active = await db.stream.findMany({
    where: { status: { in: ["OFFLINE", "LIVE"] } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { ivsPlaybackUrl: true, ivsChannelArn: true } },
    },
  });

  const latestIdByChannel = new Map<string, string>();
  for (const s of active) {
    if (!s.user.ivsChannelArn) continue;
    if (!latestIdByChannel.has(s.user.ivsChannelArn)) {
      latestIdByChannel.set(s.user.ivsChannelArn, s.id);
    }
  }

  const result = new Map<string, { status: string; playbackUrl: string | null }>();

  await Promise.all(
    active.map(async (s) => {
      const playbackUrl = s.user.ivsPlaybackUrl;
      const isLatestForChannel =
        !!s.user.ivsChannelArn &&
        latestIdByChannel.get(s.user.ivsChannelArn) === s.id;

      if (s.status === "LIVE" && s.user.ivsChannelArn && !isLatestForChannel) {
        await db.stream.update({
          where: { id: s.id },
          data: { status: "ENDED", endedAt: new Date() },
        });
        result.set(s.id, { status: "ENDED", playbackUrl });
        return;
      }

      if (s.status === "LIVE" && s.user.ivsChannelArn) {
        try {
          const { stream: ivsStream } = await ivs.send(
            new GetStreamCommand({ channelArn: s.user.ivsChannelArn }),
          );
          if (ivsStream?.state !== "LIVE") {
            await db.stream.update({
              where: { id: s.id },
              data: { status: "ENDED", endedAt: new Date() },
            });
            result.set(s.id, { status: "ENDED", playbackUrl });
            return;
          }
        } catch (e: any) {
          if (
            e.name === "ChannelNotBroadcasting" ||
            e.Code === "ChannelNotBroadcasting"
          ) {
            await db.stream.update({
              where: { id: s.id },
              data: { status: "ENDED", endedAt: new Date() },
            });
            result.set(s.id, { status: "ENDED", playbackUrl });
            return;
          }
          console.error("Reconcile check failed for stream", s.id, e);
        }
      } else if (
        s.status === "OFFLINE" &&
        s.user.ivsChannelArn &&
        isLatestForChannel
      ) {
        try {
          const { stream: ivsStream } = await ivs.send(
            new GetStreamCommand({ channelArn: s.user.ivsChannelArn }),
          );
          if (ivsStream?.state === "LIVE") {
            await db.stream.update({
              where: { id: s.id },
              data: { status: "LIVE", startedAt: new Date() },
            });
            result.set(s.id, { status: "LIVE", playbackUrl });
            return;
          }
        } catch (e: any) {
          if (
            e.name !== "ChannelNotBroadcasting" &&
            e.Code !== "ChannelNotBroadcasting"
          ) {
            console.error("Reconcile check failed for stream", s.id, e);
          }
        }
      }

      result.set(s.id, { status: s.status, playbackUrl });
    }),
  );

  return result;
}
// public — anyone can browse live/recent streams without logging in.
streamRouter.get("/", async (req: Request, res: Response) => {
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
streamRouter.get(
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

// public — anyone can watch/view a specific stream's details.
streamRouter.get("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    const stream = await db.stream.findUnique({
      where: { id },
      include: { user: true },
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

    res.json({ ...stream, playbackUrl: stream.user.ivsPlaybackUrl });
  } catch (err) {
    console.error("GET /api/streams/:id error:", err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

// requires login and ownership.
streamRouter.patch(
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

// auth optional — logged-in users get SEND_MESSAGE, anonymous viewers get view-only.
streamRouter.post(
  "/:id/chat-token",
  optionalAuth,
  async (req: Request<{ id: string }>, res: Response) => {
    const id = req.params.id;

    try {
      const stream = await db.stream.findUnique({
        where: { id },
        include: { user: true },
      });

      if (!stream || !stream.user.ivsChatRoomArn) {
        res.status(404).json({ error: "Chat room not found for this stream" });
        return;
      }

      let ivsUserId: string;
      let username: string;
      let canSend = false;

      if (req.auth?.sub) {
        const dbUser = await db.user.findUnique({
          where: { cognitoSub: req.auth.sub },
        });
        if (!dbUser) {
          res.status(401).json({
            error: "No profile found for this account. Try logging in again.",
          });
          return;
        }
        ivsUserId = dbUser.id;
        username = dbUser.name ?? dbUser.email;
        canSend = true;
      } else {
        ivsUserId = `guest-${crypto.randomUUID()}`;
        username = "Guest";
      }

      const token = await ivschat.send(
        new CreateChatTokenCommand({
          roomIdentifier: stream.user.ivsChatRoomArn,
          userId: ivsUserId,
          capabilities: canSend ? ["SEND_MESSAGE"] : [],
        }),
      );

      res.json({
        token: token.token,
        sessionExpirationTime: token.sessionExpirationTime,
        tokenExpirationTime: token.tokenExpirationTime,
        username,
        canSend,
      });
    } catch (err) {
      console.error("POST /api/streams/:id/chat-token error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

// requires login and ownership. Doesn't delete the IVS channel — it's reused by the user's next stream.
streamRouter.put(
  "/:id/end",
  requireAuth,
  requireDbUser,
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    try {
      const stream = await db.stream.findUnique({
        where: { id },
        include: { user: true },
      });

      if (!stream) {
        res.status(404).json({ error: "Stream not found" });
        return;
      }
      if (stream.userId !== req.dbUser!.id) {
        res.status(403).json({ error: "You don't own this stream" });
        return;
      }

      if (stream.user.ivsChannelArn) {
        try {
          await ivs.send(
            new StopStreamCommand({ channelArn: stream.user.ivsChannelArn }),
          );
        } catch {}
      }

      const updated = await db.stream.update({
        where: { id },
        data: { status: "ENDED", endedAt: new Date() },
      });

      broadcastToRoom(id, { type: "STREAM_ENDED", streamId: id });

      res.json(updated);
    } catch (err) {
      console.error("PUT /api/streams/:id/end error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

// called by AWS EventBridge, not a logged-in browser — locking this down later means IAM/signature verification, not requireAuth.
streamRouter.post(
  "/webhook",
  async (req: Request<{}, {}, EventBridgeIvsEvent>, res: Response) => {
    const event = req.body;

    try {
      const detailType = event["detail-type"];
      const channelArn = event?.resources?.[0];

      if (!channelArn) {
        res
          .status(400)
          .json({ error: "Could not determine channelArn from event" });
        return;
      }

      const user = await db.user.findFirst({
        where: { ivsChannelArn: channelArn },
      });
      if (!user) {
        res.json({ received: true });
        return;
      }

      const stream = await db.stream.findFirst({
        where: { userId: user.id, status: { in: ["OFFLINE", "LIVE"] } },
        orderBy: { createdAt: "desc" },
      });
      if (!stream) {
        res.json({ received: true });
        return;
      }

      if (detailType === "IVS Stream Start") {
        await db.stream.update({
          where: { id: stream.id },
          data: { status: "LIVE", startedAt: new Date() },
        });
        broadcastToRoom(stream.id, {
          type: "STREAM_LIVE",
          streamId: stream.id,
          playbackUrl: user.ivsPlaybackUrl,
        });
      } else if (detailType === "IVS Stream End") {
        await db.stream.update({
          where: { id: stream.id },
          data: { status: "ENDED", endedAt: new Date() },
        });
        broadcastToRoom(stream.id, {
          type: "STREAM_ENDED",
          streamId: stream.id,
        });
      }

      res.json({ received: true });
    } catch (err) {
      console.error("POST /api/streams/webhook error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

// viewerCount comes straight from GetStreamCommand — no need to hand-roll
// tracking from WebSocket connection counts. AWS reports new views within
// ~15s and drops within ~1min, so no point polling faster than that.
const VIEWER_COUNT_POLL_MS = 15_000;

setInterval(async () => {
  try {
    const liveStreams = await db.stream.findMany({
      where: { status: "LIVE" },
      include: { user: { select: { ivsChannelArn: true } } },
    });

    await Promise.all(
      liveStreams.map(async (s) => {
        if (!s.user.ivsChannelArn) return;
        try {
          const { stream: ivsStream } = await ivs.send(
            new GetStreamCommand({ channelArn: s.user.ivsChannelArn }),
          );
          broadcastToRoom(s.id, {
            type: "VIEWER_COUNT",
            count: ivsStream?.viewerCount ?? 0,
          });
        } catch (err: any) {
          if (
            err.name !== "ChannelNotBroadcasting" &&
            err.Code !== "ChannelNotBroadcasting"
          ) {
            console.error(
              "Failed to fetch viewer count for stream:",
              s.id,
              err,
            );
          }
        }
      }),
    );
  } catch (err) {
    console.error("Viewer count poll failed:", err);
  }
}, VIEWER_COUNT_POLL_MS);
