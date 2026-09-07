import { Router, Request, Response } from "express";
import { rateLimit } from "../../middleware/rateLimit";
import { CreateStreamBody } from "../../types/stream";
import { CreateChannelCommand, GetStreamCommand } from "@aws-sdk/client-ivs";
import {
  CreateEncoderConfigurationCommand,
  CreateParticipantTokenCommand,
  CreateStageCommand,
} from "@aws-sdk/client-ivs-realtime";
import { ivsRealtime } from "../../lib/ivs-realtime";
import { db } from "../../lib/db";
import { requireAuth } from "../../middleware/auth";
import { requireDbUser } from "../../middleware/requireDbUser";
import { errorMessage } from "../../lib/errors";
import { ivs } from "../../lib/ivs";
import { ivschat } from "../../lib/ivschat";
import { CreateRoomCommand } from "@aws-sdk/client-ivschat";

export const mobileRouter = Router();
// stage is provisioned fresh per mobile broadcast unlike the IVS channel whihc is provisioned once per user and reused - matches theephemeral, mobile WHIP
mobileRouter.post(
  "/mobile",
  requireAuth,
  requireDbUser,
  rateLimit({
    windowSeconds: 60,
    maxRequests: 3,
    keyPrefix: "mobile-stream",
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

      if (user.ivsChannelArn) {
        try {
          const { stream: ivsStream } = await ivs.send(
            new GetStreamCommand({ channelArn: user.ivsChannelArn }),
          );
          if (ivsStream?.state === "LIVE") {
            res.status(409).json({
              error:
                "You already have a live stream. Please end it before starting a new one.",
            });
            return;
          }
        } catch (e: any) {
          if (
            e.name !== "ChannelNotBroadcasting" &&
            e.Code !== "ChannelNotBroadcasting"
          ) {
            console.error("Failed to fetch IVS stream state:", e);
          }
        }
      }

      if (!user.ivsChannelArn) {
        const channelComand = new CreateChannelCommand({
          name: `meril-${userId}`,
          latencyMode: "LOW",
          type: "STANDARD",
        });

        const { channel, streamKey } = await ivs.send(channelComand);

        if (
          !channel?.arn ||
          !channel?.ingestEndpoint ||
          !channel?.playbackUrl ||
          !streamKey?.value
        ) {
          res
            .status(500)
            .json({ error: "IVS Channel creation returned incomplete data" });
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

      if (!user.ivsEncoderConfigArn) {
        const encoderCommand = new CreateEncoderConfigurationCommand({
          name: `meril-encoder-${userId}`,
          video: {
            width: 1280,
            height: 720,
            bitrate: 2500000,
            framerate: 30,
          },
        });
        const { encoderConfiguration } = await ivsRealtime.send(encoderCommand);

        if (!encoderConfiguration?.arn) {
          res.status(500).json({
            error: "IVS Encoder configuration creation returned no ARN",
          });
          return;
        }

        user = await db.user.update({
          where: { id: userId },
          data: { ivsEncoderConfigArn: encoderConfiguration.arn },
        });
      }

      if (!user.ivsChatRoomArn) {
        const chatRoom = await ivschat.send(
          new CreateRoomCommand({ name: `meril-chat-${userId}` }),
        );
        if (!chatRoom?.arn) {
          res
            .status(500)
            .json({ error: "IVS Chat Room creation returned no ARN" });
          return;
        }
        user = await db.user.update({
          where: { id: userId },
          data: { ivsChatRoomArn: chatRoom.arn },
        });
      }

      await db.stream.updateMany({
        where: { userId, status: { in: ["OFFLINE", "LIVE"] } },
        data: { status: "ENDED", endedAt: new Date() },
      });

      const stream = await db.stream.create({
        data: {
          title,
          description: description ?? null,
          userId,
          status: "OFFLINE",
        },
      });

      const stageCommand = new CreateStageCommand({
        name: `mobile-broadcast-${stream.id}`,
      });

      const { stage } = await ivsRealtime.send(stageCommand);

      if (!stage?.arn) {
        res.status(500).json({ error: "IVS Stage creation returned no ARN" });
        return;
      }

      const updated = await db.stream.update({
        where: { id: stream.id },
        data: { ivsStageArn: stage.arn },
      });

      res.status(201).json({ stream: updated });
    } catch (err) {
      console.error("POST /api/streams/mobile error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

// mobile app calls this right before establishing the WHIP session to get the ephemeral token and endpoint for the stage
mobileRouter.get(
  "/:id/mobile-token",
  requireAuth,
  requireDbUser,
  rateLimit({
    windowSeconds: 60,
    maxRequests: 3,
    keyPrefix: "mobile-token",
  }),
  async (req: Request<{ id: string }>, res: Response) => {
    const id = req.params.id;

    try {
      const stream = await db.stream.findUnique({ where: { id } });
      if (!stream) {
        res.status(404).json({ error: "Stream not found" });
        return;
      }
      if (stream.userId !== req.dbUser!.id) {
        res.status(403).json({ error: "You don't own this stream" });
        return;
      }
      if (!stream.ivsStageArn) {
        res
          .status(400)
          .json({ error: "Stream does not have an IVS Stage ARN" });
        return;
      }

      const tokenCommand = new CreateParticipantTokenCommand({
        stageArn: stream.ivsStageArn,
        userId: req.dbUser!.id,
        capabilities: ["PUBLISH"],
        duration: 60, // mins
      });

      const { participantToken } = await ivsRealtime.send(tokenCommand);

      if (!participantToken?.token) {
        res
          .status(500)
          .json({ error: "IVS Participant token creation returned no token" });
        return;
      }
      res.json({
        token: participantToken.token,
        participantId: participantToken.participantId,
      });
    } catch (err) {
      console.error("GET /api/streams/:id/mobile-token error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

mobileRouter.post(
  "/:id/whip-publish",
  requireAuth,
  requireDbUser,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const { token, sdpOffer, whipUrl } = req.body;
      if (!token || !sdpOffer) {
        res
          .status(400)
          .json({ error: "Missing required fields: token, sdpOffer" });
        return;
      }

      let currentUrl = whipUrl || "https://global.whip.live-video.net/";
      let whipRes = await fetch(currentUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
        body: sdpOffer,
        redirect: "manual",
      });
      const maxRedirects = 5;

      for (
        let i = 0;
        i < maxRedirects && whipRes.status >= 300 && whipRes.status < 400;
        i++
      ) {
        const location = whipRes.headers.get("Location");
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
        whipRes = await fetch(currentUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/sdp",
          },
          body: sdpOffer,
          redirect: "manual",
        });
      }

      const sdpAnswer = await whipRes!.text();

      if (!whipRes.ok) {
        res.status(whipRes.status).json({ error: sdpAnswer });
        return;
      }

      res.json({
        sdpAnswer,
        sessionLocation: whipRes.headers.get("Location"),
      });
    } catch (err) {
      console.error("POST /api/streams/:id/whip-publish error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);
