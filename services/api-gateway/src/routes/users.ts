import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../lib/db";

export const usersRouter = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

async function attachFallbackVideos<
  T extends { id: string; bannerUrl: string | null },
>(users: T[]): Promise<(T & { latestVideoUrl: string | null })[]> {
  const needsFallback = users.filter((u) => !u.bannerUrl).map((u) => u.id);

  const fallbackVideos = needsFallback.length
    ? await db.video.findMany({
        where: { userId: { in: needsFallback }, status: "READY" },
        orderBy: { createdAt: "desc" },
        select: { userId: true, hlsUrl: true },
      })
    : [];

  const latestByUser = new Map<string, string | null>();
  for (const v of fallbackVideos) {
    if (v.userId && !latestByUser.has(v.userId)) {
      latestByUser.set(v.userId, v.hlsUrl);
    }
  }

  return users.map((user) => ({
    ...user,
    latestVideoUrl: user.bannerUrl ? null : (latestByUser.get(user.id) ?? null),
  }));
}

// counts computed on read via _count, same as the followers lists — no denormalization until there's a real reason for one.
usersRouter.get(
  "/:userId/profile",
  async (req: Request<{ userId: string }>, res: Response) => {
    const { userId } = req.params;

    try {
      const user = await db.user.findFirst({
        where: {
          OR: [{ id: userId }, { username: userId }],
        },
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          bio: true,
          bannerUrl: true,
          socialLinks: true,
          _count: {
            select: { followers: true, following: true },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const videos = await db.video.findMany({
        where: { userId: user.id, status: "READY" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          hlsUrl: true,
          duration: true,
          viewCount: true,
          createdAt: true,
        },
      });

      res.json({
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          image: user.image,
          bio: user.bio,
          bannerUrl: user.bannerUrl,
          socialLinks: user.socialLinks,
        },
        followerCount: user._count.followers,
        followingCount: user._count.following,
        videos,
      });
    } catch (err) {
      console.error("GET /api/users/:userId/profile error:", err);
      res.status(500).json({ error: errorMessage(err) });
    }
  },
);

usersRouter.get("/search", async (req: Request, res: Response) => {
  try {
    const querySchema = z.object({
      q: z.string().trim().min(1).max(100),
      limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { q, limit = DEFAULT_PAGE_SIZE } = parsed.data;

    const users = await db.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        bannerUrl: true,
      },
    });

    const usersWithFallback = await attachFallbackVideos(users);

    res.json({ users: usersWithFallback });
  } catch (err) {
    console.error("GET /api/users/search error:", err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

usersRouter.get("/", async (req: Request, res: Response) => {
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

    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        bannerUrl: true,
      },
    });

    const hasMore = users.length > limit;
    const page = hasMore ? users.slice(0, limit) : users;

    // resolve each user's most recent READY video as a fallback background
    const usersWithFallback = await attachFallbackVideos(page);

    res.json({
      users: usersWithFallback,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ error: errorMessage(err) });
  }
});
