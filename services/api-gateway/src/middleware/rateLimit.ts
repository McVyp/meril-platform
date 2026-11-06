import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";
import { clientKey } from "../lib/clientIp";

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
  keyFn?: (req: Request) => string | null;
}

// fallback in-memory store for rate limiting when Redis is unavailable
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, windowSeconds: number) {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    memory.set(key, entry);
  }
  entry.count += 1;

  if (memory.size > 10_000) {
    for (const [k, e] of memory) if (e.resetAt < now) memory.delete(k);
  }
  return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) };
}

export function rateLimit(options: RateLimitOptions) {
  const { windowSeconds, maxRequests, keyPrefix, keyFn } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier =
      keyFn?.(req) ?? req.dbUser?.id ?? clientKey(req) ?? "unknown";

    const key = `ratelimit:${keyPrefix}:${identifier}`;

    let current: number;
    let ttl: () => Promise<number>;

    try {
      const results = await redis
        .multi()
        .incr(key)
        .expire(key, windowSeconds, "NX")
        .exec();
      if (!results || results.some(([err]) => err)) {
        throw new Error("rate limit transaction failed");
      }

      current = Number(results[0][1]);
      ttl = () => redis.ttl(key);
    } catch (error) {
      console.error("Rate limiting error using in-memeory fallback:", error);
      const hit = memoryHit(key, windowSeconds);
      current = hit.count;
      ttl = async () => hit.ttl;
    }
    if (current > maxRequests) {
      const seconds = await ttl().catch(() => windowSeconds);
      res.status(429).json({
        error: "Too many requests",
        retryAfter: seconds > 0 ? seconds : windowSeconds,
      });
      return;
    }
    next();
  };
}
