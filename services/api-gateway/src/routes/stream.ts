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
  ChatTokenBody,
  EventBridgeIvsEvent,
} from "../types/stream";

export const streamRouter = Router();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

// Provisions an IVS channel ONCE per user (checked via ivsChannelArn) and
// reuses it for every stream after — AWS only returns the stream key's plaintext value at creation time, so it must be persisted then.
streamRouter.post(
  "/",
  async (req: Request<{}, {}, CreateStreamBody>, res: Response) => {
    const { title, description, userId } = req.body;

    if (!title || !userId) {
      res.status(400).json({ error: "title and userId are required" });
      return;
    }

    try {
      let user = await db.user.findUnique({ where: { id: userId } });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

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

streamRouter.get("/", async (_req: Request, res: Response) => {
  try {
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
      include: {
        user: {
          select: { ivsPlaybackUrl: true, ivsChannelArn: true, name: true },
        },
      },
    });

    // A user's IVS channel is shared across every Stream row they've ever created, and GetStreamCommand reports on the channel, not a row — so without deduping, every stale row on the same channel would each independently see "live" and all get marked LIVE at once.
    const latestIdByChannel = new Map<string, string>();
    for (const s of streams) {
      if (!s.user.ivsChannelArn) continue;
      if (s.status !== "OFFLINE" && s.status !== "LIVE") continue;
      if (!latestIdByChannel.has(s.user.ivsChannelArn)) {
        latestIdByChannel.set(s.user.ivsChannelArn, s.id);
      }
    }

    const reconciled = await Promise.all(
      streams.map(async (s) => {
        const isLatestForChannel =
          !!s.user.ivsChannelArn &&
          latestIdByChannel.get(s.user.ivsChannelArn) === s.id;

        if (
          s.status === "LIVE" &&
          s.user.ivsChannelArn &&
          !isLatestForChannel
        ) {
          await db.stream.update({
            where: { id: s.id },
            data: { status: "ENDED", endedAt: new Date() },
          });
          return { ...s, status: "ENDED", playbackUrl: s.user.ivsPlaybackUrl };
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
              return {
                ...s,
                status: "ENDED",
                playbackUrl: s.user.ivsPlaybackUrl,
              };
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
              return {
                ...s,
                status: "ENDED",
                playbackUrl: s.user.ivsPlaybackUrl,
              };
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
              return {
                ...s,
                status: "LIVE",
                playbackUrl: s.user.ivsPlaybackUrl,
              };
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
        return { ...s, playbackUrl: s.user.ivsPlaybackUrl };
      }),
    );

    res.json(reconciled);
  } catch (err) {
    console.error("GET /api/streams error:", err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

// The studio page's own current stream — rehydrates state after a reload,
// since studio's title/description/stream state is plain useState.
// Includes ingestEndpoint/streamKey, unlike the other endpoints — safe
// only because the caller always passes their own userId.
streamRouter.get("/mine", async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

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
});

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

streamRouter.patch(
  "/:id",
  async (req: Request<{ id: string }, {}, PatchStreamBody>, res: Response) => {
    const id = req.params.id as string;
    const { title, description } = req.body;

    try {
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

streamRouter.post(
  "/:id/chat-token",
  async (req: Request<{ id: string }, {}, ChatTokenBody>, res: Response) => {
    const id = req.params.id as string;
    const { username } = req.body;

    if (!username) {
      res.status(400).json({ error: "username is required" });
      return;
    }

    try {
      const stream = await db.stream.findUnique({
        where: { id },
        include: { user: true },
      });

      if (!stream || !stream.user.ivsChatRoomArn) {
        res.status(404).json({ error: "Chat room not found for this stream" });
        return;
      }

      const token = await ivschat.send(
        new CreateChatTokenCommand({
          roomIdentifier: stream.user.ivsChatRoomArn,
          userId: username,
          capabilities: ["SEND_MESSAGE"],
        }),
      );

      res.json({
        token: token.token,
        sessionExpirationTime: token.sessionExpirationTime,
        tokenExpirationTime: token.tokenExpirationTime,
      });
    } catch (err) {
      console.error("POST /api/streams/:id/chat-token error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

// Doesn't delete the IVS channel — it's persistent, reused by the user's next stream.
streamRouter.put("/:id/end", async (req: Request, res: Response) => {
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
});

// Channel identity lives on User, so find the user by channelArn first, then their current in-flight stream row.
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
        } catch (err:any) {
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
