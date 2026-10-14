import type { Request } from "express";
import { createHmac, timingSafeEqual } from "crypto";

function fromTrustedProxy(req: Request): boolean {
  const secret = process.env.GATEWAY_PROXY_SECRET;
  const given = req.header("x-proxy-secret");
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// retrieves the client's IP address from nextjs requests, considering the proxy headers if the secret matches.
export function clientIp(req: Request): string {
  const forwarded = req.header("x-client-ip");
  if (fromTrustedProxy(req) && forwarded) {
    return forwarded;
  }
  return req.ip ?? "unknown";
}

// real ip is never stored, only its hashed key is used for identification
export function clientKey(req: Request): string {
  const secret = process.env.GATEWAY_PROXY_SECRET ?? "dev";
  return createHmac("sha256", secret)
    .update(clientIp(req))
    .digest("hex")
    .slice(0, 32);
}

export function clientCountry(req: Request): string | null {
  if (!fromTrustedProxy(req)) return null;
  const c = req.header("x-client-country")?.toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) ? c : null;
}
