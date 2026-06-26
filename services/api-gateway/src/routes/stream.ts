import { Router, Request, Response } from "express";
import {
  CreateChannelCommand,
  GetStreamCommand,
  StopStreamCommand,
} from "@aws-sdk/client-ivs";
import { ivs } from "../lib/ivs";
import { db } from "../lib/db";
import { broadcastToRoom } from "../lib/ws";

export const streamRouter = Router();

// POST /api/streams — create IVS channel + save to DB
streamRouter.post("/", async (req: Request, res: Response) => {
  const { title, userId } = req.body;

  if (!title || !userId) {
    res.status(400).json({ error: "title and userId are required" });
    return;
  }

  try {
    const command = new CreateChannelCommand({
      name: `meril-${Date.now()}`,
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

    const stream = await db.stream.create({
      data: {
        title,
        userId,
        channelArn: channel.arn,
        playbackUrl: channel.playbackUrl,
        status: "OFFLINE",
      },
    });

    res.status(201).json({
      stream,
      ingestEndpoint: `rtmps://${channel.ingestEndpoint}:443/app/`,
      streamKey: streamKey.value,
    });
  } catch (err) {
    console.error("POST /api/streams error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/streams — list all streams
streamRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const streams = await db.stream.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(streams);
  } catch (err) {
    console.error("GET /api/streams error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/streams/:id — get stream + live status from IVS
streamRouter.get("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    const stream = await db.stream.findUnique({ where: { id } });

    if (!stream) {
      res.status(404).json({ error: "Stream not found" });
      return;
    }

    if (stream.channelArn) {
      try {
        const { stream: ivsStream } = await ivs.send(
          new GetStreamCommand({ channelArn: stream.channelArn }),
        );

        if (ivsStream?.state === "LIVE" && stream.status !== "LIVE") {
          await db.stream.update({
            where: { id },
            data: { status: "LIVE", startedAt: new Date() },
          });
          stream.status = "LIVE";
        }
      } catch {
      }
    }

    res.json(stream);
  } catch (err) {
    console.error("GET /api/streams/:id error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/streams/:id/end — stop IVS stream + update DB
streamRouter.put("/:id/end", async (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    const stream = await db.stream.findUnique({ where: { id } });

    if (!stream) {
      res.status(404).json({ error: "Stream not found" });
      return;
    }

    if (stream.channelArn) {
      try {
        await ivs.send(
          new StopStreamCommand({ channelArn: stream.channelArn }),
        );
      } catch {
      }
    }

    const updated = await db.stream.update({
      where: { id },
      data: { status: "ENDED", endedAt: new Date() },
    });

    res.json(updated);
  } catch (err) {
    console.error("PUT /api/streams/:id/end error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/streams/webhook — EventBridge IVS events
streamRouter.post("/webhook", async (req: Request, res: Response) => {
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

    const stream = await db.stream.findFirst({ where: { channelArn } });
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
        playbackUrl: stream.playbackUrl,
      });
    } else if (detailType === "IVS Stream End") {
      await db.stream.update({
        where: { id: stream.id },
        data: { status: "ENDED", endedAt: new Date() },
      });
      broadcastToRoom(stream.id, { type: "STREAM_ENDED", streamId: stream.id });
    }

    res.json({ received: true });
  } catch (err) {
    console.error("POST /api/streams/webhook error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});
