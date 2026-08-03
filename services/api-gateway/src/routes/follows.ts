import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireDbUser } from "../middleware/requireDbUser";

export const followRouter = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

followRouter.post(
  "/follows/:userId",
  requireAuth,
  requireDbUser,
  async (req: Request<{ userId: string }>, res: Response) => {
    const followingId = req.params.userId;
    const followerId = req.dbUser!.id;

    if (followerId === followingId) {
      res.status(400).json({ error: "You can't follow yourself" });
      return;
    }

    try {
      const targetExists = await db.user.findUnique({
        where: { id: followingId },
        select: { id: true },
      });
      if (!targetExists) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const follow = await db.follow.create({
        data: { followerId, followingId },
      });

      res.status(201).json({ follow });
    } catch (err: any) {
      if (err.code === "P2002") {
        res.status(409).json({ error: "Already following this user" });
        return;
      }
      console.error("POST /api/follows/:userId error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

// requires login. Idempotent — unfollowing a non-follow is a no-op 200,
// not a 404, so the frontend doesn't need to special-case double-clicks.
followRouter.delete(
  "/follows/:userId",
  requireAuth,
  requireDbUser,
  async (req: Request<{ userId: string }>, res: Response) => {
    const followingId = req.params.userId;
    const followerId = req.dbUser!.id;

    try {
      await db.follow.deleteMany({
        where: { followerId, followingId },
      });
      res.status(200).json({ unfollowed: true });
    } catch (err) {
      console.error("DELETE /api/follows/:userId error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

followRouter.get(
  "/users/:userId/followers",
  async (req: Request<{ userId: string }>, res: Response) => {
    const userId = req.params.userId;

    try {
      const querySchema = z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const { cursor, limit = DEFAULT_PAGE_SIZE } = parsed.data;

      const rows = await db.follow.findMany({
        where: { followingId: userId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        include: {
          follower: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      res.json({
        followers: page.map((r) => r.follower),
        nextCursor: hasMore ? page[page.length - 1].id : null,
      });
    } catch (err) {
      console.error("GET /api/users/:userId/followers error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

followRouter.get(
  "/users/:userId/following",
  async (req: Request<{ userId: string }>, res: Response) => {
    const userId = req.params.userId;

    try {
      const querySchema = z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const { cursor, limit = DEFAULT_PAGE_SIZE } = parsed.data;

      const rows = await db.follow.findMany({
        where: { followerId: userId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        include: {
          following: {
            select: { id: true, name: true, username: true, image: true },
          },
        },
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      res.json({
        following: page.map((r) => r.following),
        nextCursor: hasMore ? page[page.length - 1].id : null,
      });
    } catch (err) {
      console.error("GET /api/users/:userId/following error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

followRouter.get(
  "/follows/:userId/status",
  requireAuth,
  requireDbUser,
  async (req: Request<{ userId: string }>, res: Response) => {
    const followingId = req.params.userId;
    const followerId = req.dbUser!.id;

    try {
      const existing = await db.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });
      res.json({ isFollowing: Boolean(existing) });
    } catch (err) {
      console.error("GET /api/follows/:userId/status error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);
