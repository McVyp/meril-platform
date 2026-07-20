import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { CompleteWebAuthnRegistrationCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "@/lib/auth/cognito-server-client";
import { withAccessToken } from "@/lib/auth/with-access-token";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { credential } = body;
  if (!credential) {
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }
  return withAccessToken(async (accessToken) => {
    await cognitoClient.send(
      new CompleteWebAuthnRegistrationCommand({
        AccessToken: accessToken,
        Credential: credential,
      }),
    );
    return { ok: true };
  });
}
