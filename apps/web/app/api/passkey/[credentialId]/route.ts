import { NextRequest } from "next/server";
import { DeleteWebAuthnCredentialCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "@/lib/auth/cognito-server-client";
import { withAccessToken } from "@/lib/auth/with-access-token";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  const { credentialId } = await params;
  return withAccessToken(async (accessToken) => {
    await cognitoClient.send(
      new DeleteWebAuthnCredentialCommand({
        AccessToken: accessToken,
        CredentialId: credentialId,
      }),
    );
    return { ok: true };
  });
}
