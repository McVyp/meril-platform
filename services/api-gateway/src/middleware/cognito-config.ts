import { createRemoteJWKSet } from "jose";

export const REGION = process.env.COGNITO_REGION;
export const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
export const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const missing = [
  !REGION && "COGNITO_REGION",
  !USER_POOL_ID && "COGNITO_USER_POOL_ID",
  !CLIENT_ID && "COGNITO_CLIENT_ID",
].filter(Boolean);

if (missing.length) {
  throw new Error(`Missing env var(s): ${missing.join(", ")}`);
}

export const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;
export const JWKS = createRemoteJWKSet(
  new URL(`${ISSUER}/.well-known/jwks.json`),
);
