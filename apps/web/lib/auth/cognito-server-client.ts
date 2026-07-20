import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

export const REGION = process.env.NEXT_PUBLIC_COGNITO_REGION!;
export const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;

const missing = [
  !REGION && "NEXT_PUBLIC_COGNITO_REGION",
  !CLIENT_ID && "NEXT_PUBLIC_COGNITO_CLIENT_ID",
].filter(Boolean);

if (missing.length) {
  throw new Error(`Missing env var(s): ${missing.join(", ")}`);
}

export const cognitoClient = new CognitoIdentityProviderClient({
  region: REGION,
});
