import { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis";

export async function dedupEventBridgeEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const eventId = req.body?.id;
  if (!eventId) {
    next();
    return;
  }
  try {
    const key = `event:dedup:${eventId}`;
    const result = await redis.set(key, "1", "EX", 300, "NX");
    if (result !== "OK") {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    next();
  } catch (err) {
    console.error("Error in dedupEventBridge middleware:", err);
    next();
  }
}
