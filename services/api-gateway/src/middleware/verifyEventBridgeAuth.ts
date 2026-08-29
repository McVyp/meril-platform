import { NextFunction, Request, Response } from "express";
import crypto from "crypto";

export function verifyEventBridgeAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const provided = req.headers["x-webhook-secret"];
  const expected = process.env.EVENTBRIDGE_WEBHOOK_SECRET;
  if (
    typeof provided !== "string" ||
    !expected ||
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
