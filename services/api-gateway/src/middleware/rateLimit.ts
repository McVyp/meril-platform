import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
  keyFn?: (req: Request) => string | null;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowSeconds, maxRequests, keyPrefix, keyFn } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = keyFn?.(req) ?? req.dbUser?.id ?? req.ip ?? "unknown";

    const key = `ratelimit:${keyPrefix}:${identifier}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        res.status(429).json({
          error: "Too many requests",
          retryAfter: ttl > 0 ? ttl : windowSeconds,
        });
        return;
      }
      next();
    } catch (error) {
      console.error("Rate limiting error:", error);
      next();
    }
  };
}
