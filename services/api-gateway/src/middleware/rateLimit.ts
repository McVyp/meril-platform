import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";
import { clientKey } from "../lib/clientIp";

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
  keyFn?: (req: Request) => string | null;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowSeconds, maxRequests, keyPrefix, keyFn } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier =
      keyFn?.(req) ?? req.dbUser?.id ?? clientKey(req) ?? "unknown";

    const key = `ratelimit:${keyPrefix}:${identifier}`;

    try {
      const results = await redis
        .multi()
        .incr(key)
        .expire(key, windowSeconds, "NX")
        .exec();
      if (!results || results.some(([err]) => err)) {
        throw new Error("rate limit transaction failed");
      }
      const current = Number(results[0][1]);
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
