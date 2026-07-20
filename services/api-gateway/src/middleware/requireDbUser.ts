import type { Request, Response, NextFunction } from "express";
import { db } from "../lib/db";

export async function requireDbUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.auth?.sub) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const user = await db.user.findUnique({
      where: { cognitoSub: req.auth.sub },
    });

    if (!user) {
      res.status(401).json({
        error: "No profile found for this account. Try logging in again.",
      });
      return;
    }

    req.dbUser = user;
    next();
  } catch (err) {
    console.error("requireDbUser lookup failed:", err);
    res.status(500).json({ error: "Failed to resolve user profile" });
  }
}
