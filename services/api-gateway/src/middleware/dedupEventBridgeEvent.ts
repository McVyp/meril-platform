import { NextFunction, Request, Response } from "express";
import { db } from "../lib/db";

export async function dedupEventBridgeEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const eventId = req.body?.id;
  if (typeof eventId !== "string" || !eventId) {
    next();
    return;
  }
  try {
    await db.processedEvent.create({ data: { id: eventId } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      // Duplicate event, ignore it
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    console.error("Error in dedupEventBridge middleware:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  res.on("finish", async () => {
    if (res.statusCode >= 500) {
      db.processedEvent
        .delete({ where: { id: eventId } })
        .catch((err) =>
          console.error(
            "Error deleting processed event after failed response:",
            err,
          ),
        );
    }
  });
  next();
}
