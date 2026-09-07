import { Router, Request, Response } from "express";
import { verifyEventBridgeAuth } from "../../middleware/verifyEventBridgeAuth";
import { dedupEventBridgeEvent } from "../../middleware/dedupEventBridgeEvent";

import { errorMessage } from "../../lib/errors";
import { StartCompositionCommand } from "@aws-sdk/client-ivs-realtime";
import { EventBridgeIvsEvent } from "../../types/stream";
import { db } from "../../lib/db";
import { broadcastToRoom } from "../../lib/ws";
import { ivsRealtime } from "../../lib/ivs-realtime";

export const webhooksRouter = Router();

// called by AWS EventBridge, not a logged-in browser — locking this down later means IAM/signature verification, not requireAuth.
webhooksRouter.post(
  "/webhook",
  verifyEventBridgeAuth,
  dedupEventBridgeEvent,
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

webhooksRouter.post(
  "/webhook-realtime",
  verifyEventBridgeAuth,
  dedupEventBridgeEvent,
  async (req: Request<{}, {}, any>, res: Response) => {
    const event = req.body;
    try {
      const detailType = event["detail-type"];
      const eventName = event?.detail?.event_name;
      const stageArn = event?.resources?.[0];

      if (
        detailType !== "IVS Stage Update" ||
        eventName !== "Participant Published"
      ) {
        res.json({ received: true });
        return;
      }

      if (!stageArn) {
        res
          .status(400)
          .json({ error: "Could not determine stageArn from event" });
        return;
      }

      const stream = await db.stream.findFirst({
        where: { ivsStageArn: stageArn, status: { in: ["OFFLINE", "LIVE"] } },
        orderBy: { createdAt: "desc" },
        include: { user: true },
      });

      if (
        !stream ||
        !stream.user.ivsChannelArn ||
        !stream.user.ivsEncoderConfigArn
      ) {
        res.json({ received: true });
        return;
      }

      // avoid starting  duplicate composition for a stream
      if (stream.ivsCompositionId) {
        res.json({ received: true });
        return;
      }

      const compositionCommand = new StartCompositionCommand({
        stageArn,
        destinations: [
          {
            channel: {
              channelArn: stream.user.ivsChannelArn,
              encoderConfigurationArn: stream.user.ivsEncoderConfigArn,
            },
          },
        ],
      });

      const { composition } = await ivsRealtime.send(compositionCommand);

      if (!composition?.arn) {
        res
          .status(500)
          .json({ error: "IVS Composition creation returned no ARN" });
        return;
      }

      await db.stream.update({
        where: { id: stream.id },
        data: { ivsCompositionId: composition.arn },
      });

      res.json({ received: true });
    } catch (err) {
      console.error("POST /api/streams/webhook-realtime error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);
