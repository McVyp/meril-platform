import { Router, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireDbUser } from "../../middleware/requireDbUser";
import { db } from "../../lib/db";
import { ivs } from "../../lib/ivs";

import { StopStreamCommand } from "@aws-sdk/client-ivs";
import {
  StopCompositionCommand,
  DeleteStageCommand,
} from "@aws-sdk/client-ivs-realtime";
import { errorMessage } from "../../lib/errors";
import { broadcastToRoom } from "../../lib/ws";
import { ivsRealtime } from "../../lib/ivs-realtime";

export const lifecycleRouter = Router();
// doesn't delete the IVS channel — it's reused by the user's next stream.
lifecycleRouter.put(
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

      if (stream.ivsCompositionId) {
        try {
          await ivsRealtime.send(
            new StopCompositionCommand({ arn: stream.ivsCompositionId }),
          );
        } catch {}
      }

      if (stream.ivsStageArn) {
        try {
          await ivsRealtime.send(
            new DeleteStageCommand({ arn: stream.ivsStageArn }),
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
