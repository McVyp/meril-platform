import { Router, Request, Response } from "express";
import { optionalAuth } from "../../middleware/auth";
import { rateLimit } from "../../middleware/rateLimit";
import { db } from "../../lib/db";
import crypto from "crypto";
import { CreateChatTokenCommand } from "@aws-sdk/client-ivschat";
import { ivschat } from "../../lib/ivschat";
import { errorMessage } from "../../lib/errors";

export const chatRouter = Router();
// auth optional — logged-in users get SEND_MESSAGE, anonymous viewers get view-only.
chatRouter.post(
  "/:id/chat-token",
  optionalAuth,
  rateLimit({
    windowSeconds: 60,
    maxRequests: 3,
    keyPrefix: "chat-token",
    keyFn: (req) => req.ip ?? null,
  }),
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
      let displayName: string;
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
        username = dbUser.username ?? dbUser.id;
        displayName = dbUser.name ?? dbUser.email;
        canSend = true;
      } else {
        const guestSuffix = crypto.randomUUID().slice(0, 6);
        ivsUserId = `guest-${crypto.randomUUID()}`;
        username = `guest_${guestSuffix}`;
        displayName = `Guest ${guestSuffix}`;
      }

      const token = await ivschat.send(
        new CreateChatTokenCommand({
          roomIdentifier: stream.user.ivsChatRoomArn,
          userId: ivsUserId,
          capabilities: canSend ? ["SEND_MESSAGE"] : [],
          attributes: { username, displayName },
        }),
      );

      res.json({
        token: token.token,
        sessionExpirationTime: token.sessionExpirationTime,
        tokenExpirationTime: token.tokenExpirationTime,
        username,
        displayName,
        canSend,
      });
    } catch (err) {
      console.error("POST /api/streams/:id/chat-token error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);
