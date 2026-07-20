import { jwtVerify } from "jose";
import { CLIENT_ID, ISSUER, JWKS } from "./cognito-config";

export interface VerifiedIdToken {
  sub: string;
  email: string;
}

// throws on any invalid/expired/wrong-token-type token — caller should catch and respond 401.
export async function verifyIdToken(token: string): Promise<VerifiedIdToken> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    algorithms: ["RS256"],
  });

  if (payload.token_use !== "id") {
    throw new Error("Expected an ID token");
  }

  // ID tokens use `aud`, not `client_id` (that's the access token).
  if (payload.aud !== CLIENT_ID) {
    throw new Error("Token was not issued for this app");
  }

  if (typeof payload.sub !== "string") {
    throw new Error("Token missing sub claim");
  }
  if (typeof payload.email !== "string") {
    throw new Error("Token missing email claim");
  }

  return { sub: payload.sub, email: payload.email };
}
