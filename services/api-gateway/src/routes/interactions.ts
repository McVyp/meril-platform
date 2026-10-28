import { Router } from "express";
import { clientCountry } from "../lib/clientIp";
import { z } from "zod";
import { rateLimit } from "../middleware/rateLimit";
import { optionalAuth } from "../middleware/auth";
import { redis } from "../lib/redis";
import { emitEvent } from "../lib/kafkaProducer";
import { db } from "../lib/db";

export const interactionsRouter = Router();

const TOPIC_USER_INTERACTIONS = process.env.KAFKA_TOPIC_INTERACTIONS!;
const RECENT_MAX = 20; // recent views kept per viewer for the real-time feed
const RECENT_TTL_SECONDS = 60 * 60 * 24; // recent list expires after 1 day idle
const MAX_SECONDS = 60 * 60 * 6; // sanity cap: all durations are in seconds

const viewSchema = z.object({
  eventId: z.uuid(),
  videoId: z.string().min(1).max(64),
  watchedDuration: z.number().min(0).max(MAX_SECONDS),
  duration: z.number().positive().max(MAX_SECONDS),
  occurredAt: z.iso.datetime(),
});

const bodySchema = z.object({
  sessionId: z.uuid(),
  events: z.array(viewSchema).min(1).max(RECENT_MAX),
});

interactionsRouter.post(
  "/",
  rateLimit({ windowSeconds: 60, maxRequests: 120, keyPrefix: "interactions" }),
  optionalAuth,
  async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) });
      return;
    }

    const { sessionId, events } = parsed.data;
    const country = clientCountry(req);

    try {
      let userId: string | null = null;
      if (req.auth?.sub) {
        const dbUser = await db.user.findUnique({
          where: { cognitoSub: req.auth.sub },
          select: { id: true },
        });
        userId = dbUser?.id ?? null;
      }
      // kafka: durable history of user interactions
      for (const e of events) {
        await emitEvent(
          TOPIC_USER_INTERACTIONS,
          {
            eventType: "video.interaction",
            eventId: e.eventId,
            userId,
            sessionId,
            videoId: e.videoId,
            watchedDuration: Math.min(e.watchedDuration, e.duration),
            duration: e.duration,
            occurredAt: e.occurredAt,
            country,
          },
          e.videoId,
        );
      }
      // redis: newest-first list of recent views, read by the feed.
      try {
        const key = userId
          ? `recent:user:${userId}`
          : `recent:session:${sessionId}`;
        const entries = events.map((e) =>
          JSON.stringify({
            videoId: e.videoId,
            ratio: Math.min(e.watchedDuration / e.duration, 1),
            at: e.occurredAt,
          }),
        );
        await redis
          .multi()
          .lpush(key, ...entries)
          .ltrim(key, 0, RECENT_MAX - 1)
          .expire(key, RECENT_TTL_SECONDS)
          .exec();
      } catch (err) {
        console.error("Failed to update recent interactions", err);
      }
      res.status(200).json({ accepted: events.length });
    } catch (err) {
      console.error("Failed to process interaction events:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);
