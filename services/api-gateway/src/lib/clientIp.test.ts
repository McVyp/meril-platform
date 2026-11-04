import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientCountry, clientIp, clientKey } from "./clientIp";

const SECRET = "test-proxy-secret";

const req = (headers: Record<string, string>, ip = "10.0.0.1") =>
  ({
    ip,
    header: (n: string) => headers[n.toLowerCase()],
  }) as unknown as Request;

beforeEach(() => vi.stubEnv("GATEWAY_PROXY_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("clientIp", () => {
  it.each([
    ["correct secret", SECRET, "203.0.113.7"],
    ["wrong secret, same length", "test-proxy-secreX", "10.0.0.1"],
    ["wrong secret, other length", "x", "10.0.0.1"],
    ["no secret", undefined, "10.0.0.1"],
  ])("%s -> %s", (_, secret, expected) => {
    const headers: Record<string, string> = {
      "x-client-ip": "203.0.113.7",
    };
    if (secret) headers["x-proxy-secret"] = secret;
    expect(clientIp(req(headers))).toBe(expected);
  });
});

describe("clientKey", () => {
  it("is a stable 32-char hash per IP, never the raw IP", () => {
    const a = clientKey(req({}, "198.51.100.1"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(clientKey(req({}, "198.51.100.1"))).toBe(a);
    expect(clientKey(req({}, "198.51.100.2"))).not.toBe(a);
  });
});

describe("clientCountry", () => {
  it.each([
    [{ "x-proxy-secret": SECRET, "x-client-country": "us" }, "US"],
    [{ "x-proxy-secret": SECRET, "x-client-country": "JPN" }, null],
    [{ "x-client-country": "US" }, null],
  ])("%o -> %s", (headers, expected) => {
    expect(clientCountry(req(headers))).toBe(expected);
  });
});
