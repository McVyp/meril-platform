import { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./rateLimit";
import { redis } from "../lib/redis";

const store = vi.hoisted(() => new Map<string, number>());

vi.mock("../lib/redis", () => {
  const expire = vi.fn();
  const multi = vi.fn(() => {
    let key = "";
    const chain = {
      incr: (k: string) => ((key = k), chain),
      expire: (...args: unknown[]) => (expire(...args), chain),
      exec: async () => {
        const n = (store.get(key) ?? 0) + 1;
        store.set(key, n);
        return [
          [null, n],
          [null, 1],
        ];
      },
    };
    return chain;
  });
  return { redis: { multi, expire, ttl: vi.fn(async () => 42) } };
});

const limiter = rateLimit({
  windowSeconds: 60,
  maxRequests: 2,
  keyPrefix: "test",
});

async function hit(ip = "1.1.1.1", userId?: string) {
  const req = {
    ip,
    header: () => undefined,
    dbUser: userId ? { id: userId } : undefined,
  } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await limiter(req, res as unknown as Response, next as NextFunction);
  return { res, next };
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("rateLimit", () => {
  it("allows up to the limit, then answers 429", async () => {
    expect((await hit()).next).toHaveBeenCalled();
    expect((await hit()).next).toHaveBeenCalled();
    const { res, next } = await hit();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many requests",
      retryAfter: 42,
    });
  });

  it("counts each client seperately", async () => {
    await hit("1.1.1.1");
    await hit("1.1.1.1");
    expect((await hit("2.2.2.2")).next).toHaveBeenCalled();
  });

  it("counts a logged-in user across IPs", async () => {
    await hit("1.1.1.1", "user1");
    await hit("2.2.2.2", "user1");
    expect((await hit("3.3.3.3", "user1")).res.status).toHaveBeenCalledWith(
      429,
    );
  });

  it("sets the window expiry with NX", async () => {
    await hit();
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 60, "NX");
  });

  it("lets requests through when Redis fails", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    vi.mocked(redis.multi).mockImplementationOnce(() => {
      throw new Error("redis down");
    });
    expect((await hit()).next).toHaveBeenCalled();
  });
});
