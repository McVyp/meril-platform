import { Router, Request, Response } from "express";
import { requireDbUser } from "../middleware/requireDbUser";
import { z } from "zod";
import { db } from "../lib/db";
import { verifyIdToken } from "../middleware/verifyIdToken";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

function slugifyForUsername(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "user"
  );
}

async function generateUniqueUsername(email: string): Promise<string> {
  const base = slugifyForUsername(email.split("@")[0]);

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate =
      attempt === 0 ? base : `${base}${Math.floor(Math.random() * 100000)}`;
    const clash = await db.user.findUnique({ where: { username: candidate } });
    if (!clash) return candidate;
  }

  return `${base}${Date.now()}`;
}

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
        const username = await generateUniqueUsername(email);
        user = await db.user.upsert({
          where: { cognitoSub: sub },
          update: {},
          create: { email, cognitoSub: sub, username },
        });
      }
    }

    res.json({ user });
  } catch (err) {
    console.error("POST /api/auth/sync error:", err);
    res.status(500).json({ error: "Failed to sync user profile" });
  }
});

const socialLinkSchema = z.object({
  platform: z.string().min(1).max(30),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
      message: "URL must start with http:// or https://",
    }),
});

authRouter.patch(
  "/profile",
  requireAuth,
  requireDbUser,
  async (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().trim().min(1).max(50).optional(),
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(
          /^[a-z0-9_-]+$/,
          "Only lowercase letters, numbers, hyphens, and underscores",
        )
        .min(3)
        .max(30)
        .optional(),
      socialLinks: z.array(socialLinkSchema).max(10).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      if (parsed.data.username) {
        const existing = await db.user.findUnique({
          where: { username: parsed.data.username },
        });
        if (existing && existing.id !== req.dbUser!.id) {
          res.status(409).json({ error: "Username already taken" });
          return;
        }
      }

      const user = await db.user.update({
        where: { id: req.dbUser!.id },
        data: {
          ...(parsed.data.name && { name: parsed.data.name }),
          ...(parsed.data.username && { username: parsed.data.username }),
          ...(parsed.data.socialLinks && {
            socialLinks: parsed.data.socialLinks,
          }),
        },
      });
      res.json({
        name: user.name,
        username: user.username,
        socialLinks: user.socialLinks,
      });
    } catch (err: any) {
      // race: two requests claim the same username between the check above and this write
      if (err.code === "P2002") {
        res.status(409).json({ error: "Username already taken" });
        return;
      }
      console.error("PATCH /api/auth/profile error:", err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  },
);

authRouter.get(
  "/me",
  requireAuth,
  requireDbUser,
  async (req: Request, res: Response) => {
    res.json({
      id: req.dbUser!.id,
      name: req.dbUser!.name,
      email: req.dbUser!.email,
      username: req.dbUser!.username,
      socialLinks: req.dbUser!.socialLinks,
    });
  },
);
