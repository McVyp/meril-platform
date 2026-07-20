import { Router, Request, Response } from "express";
import { requireDbUser } from "../middleware/requireDbUser";
import { z } from "zod";
import { db } from "../lib/db";
import { verifyIdToken } from "../middleware/verifyIdToken";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

// falls back to matching by email so a pre-existing row gets linked, not duplicated.
authRouter.post("/sync", async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
    return;
  }
  const idToken = header.slice("Bearer ".length);

  let sub: string;
  let email: string;
  try {
    const verified = await verifyIdToken(idToken);
    sub = verified.sub;
    email = verified.email;
  } catch (err) {
    console.error("POST /api/auth/sync token verification failed:", err);
    res.status(401).json({ error: "Invalid or expired ID token" });
    return;
  }

  try {
    let user = await db.user.findUnique({ where: { cognitoSub: sub } });

    if (!user) {
      const existingByEmail = await db.user.findUnique({ where: { email } });

      if (existingByEmail && existingByEmail.cognitoSub) {
        // Email matches, but that row is already linked to a different
        // Cognito account — don't relink it out from under them.
        res
          .status(409)
          .json({ error: "Email already linked to another account" });
        return;
      }

      if (existingByEmail) {
        user = await db.user.update({
          where: { id: existingByEmail.id },
          data: { cognitoSub: sub },
        });
      } else {
        user = await db.user.upsert({
          where: { cognitoSub: sub },
          update: {},
          create: { email, cognitoSub: sub },
        });
      }
    }

    res.json({ user });
  } catch (err) {
    console.error("POST /api/auth/sync error:", err);
    res.status(500).json({ error: "Failed to sync user profile" });
  }
});

// only updates the caller's own name — userId always comes from req.dbUser, never the body.
authRouter.patch(
  "/profile",
  requireAuth,
  requireDbUser,
  async (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(50),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const user = await db.user.update({
        where: { id: req.dbUser!.id },
        data: { name: parsed.data.name },
      });
      res.json({ name: user.name });
    } catch (err) {
      console.error("PATCH /api/auth/profile error:", err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  },
);

// returns only the caller's own name/email — no other user's data is reachable here.
authRouter.get(
  "/me",
  requireAuth,
  requireDbUser,
  async (req: Request, res: Response) => {
    res.json({
      name: req.dbUser!.name,
      email: req.dbUser!.email,
    });
  },
);
