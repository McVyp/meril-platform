import { NextRequest, NextResponse } from "next/server";
import {
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { getSessionTokens } from "@/lib/auth/session";
import { cognitoClient } from "@/lib/auth/cognito-server-client";

export async function POST(req: NextRequest) {
  const { accessToken } = await getSessionTokens();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { code } = body;
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const verifyResponse = await cognitoClient.send(
      new VerifySoftwareTokenCommand({
        AccessToken: accessToken,
        UserCode: code,
      }),
    );
    if (verifyResponse.Status !== "SUCCESS") {
      return NextResponse.json(
        { error: "Invalid code — check your authenticator app and try again." },
        { status: 400 },
      );
    }

    await cognitoClient.send(
      new SetUserMFAPreferenceCommand({
        AccessToken: accessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("TOTP verify failed:", err);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 },
    );
  }
}
