import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";
import { CLIENT_ID, ISSUER, JWKS } from "./cognito-config";

async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    algorithms: ["RS256"],
  });

  if (payload.token_use !== "access") {
    throw new Error("Expected an access token");
  }
  if (payload.client_id !== CLIENT_ID) {
    throw new Error("Token was not issued for this app");
  }
  if (typeof payload.sub !== "string") {
    throw new Error("Token missing sub claim");
  }

  return {
    sub: payload.sub,
    username:
      typeof payload.username === "string" ? payload.username : undefined,
  };
}

// verifies the access token and attaches req.auth. Fails closed (401) on any error.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
    return;
  }

  try {
    req.auth = await verifyAccessToken(header.slice("Bearer ".length));
    next();
  } catch (err) {
    console.error("requireAuth token verification failed:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// like requireAuth, but a missing header just proceeds as anonymous — a present-but-invalid token still fails closed.
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    req.auth = await verifyAccessToken(header.slice("Bearer ".length));
    next();
  } catch (err) {
    console.error("optionalAuth token verification failed:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
