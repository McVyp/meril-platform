import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyEventBridgeAuth } from "./verifyEventBridgeAuth";

const SECRET = "test-webhook-secret"; // 19 chars

function run(secret?: string) {
  const req = {
    headers: secret === undefined ? {} : { "x-webhook-secret": secret },
  } as unknown as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  verifyEventBridgeAuth(req, res as unknown as Response, next as NextFunction);
  return { req, res, next };
}

beforeEach(() => vi.stubEnv("EVENTBRIDGE_WEBHOOK_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("verifyEventBridgeAuth", () => {
  it("lets the correct secret through", () => {
    const { res, next } = run(SECRET);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong secret, same length", "test-webhook-secreX"],
    ["wrong secret, other length", "x"],
    ["no secret", undefined],
    ["same characters count, different bytes", "é".repeat(19)],
  ])("rejects: %s", (_, secret) => {
    const { res, next } = run(secret);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects everything when no secret is configured", () => {
    vi.stubEnv("EVENTBRIDGE_WEBHOOK_SECRET", "");
    const { res } = run("");
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("compares the secret with timingSafeEqual (constant time)", () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    run(SECRET);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
