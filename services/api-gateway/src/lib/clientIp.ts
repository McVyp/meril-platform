import type { Request } from "express";
import { createHmac, timingSafeEqual } from "crypto";

// retrieves the client's IP address from nextjs requests, considering the proxy headers if the secret matches.
export function clientIp(req: Request): string {
  const secret = process.env.GATEWAY_PROXY_SECRET;
  const given = req.header("x-proxy-secret");
  const forwarded = req.header("x-client-ip");
  if (
    secret &&
    given &&
    forwarded &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
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
