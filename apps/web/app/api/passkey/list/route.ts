import { ListWebAuthnCredentialsCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "@/lib/auth/cognito-server-client";
import { withAccessToken } from "@/lib/auth/with-access-token";

export async function GET() {
  return withAccessToken(async (accessToken) => {
    const res = await cognitoClient.send(
      new ListWebAuthnCredentialsCommand({ AccessToken: accessToken }),
    );
    const credentials = (res.Credentials ?? []).map((c) => ({
      credentialId: c.CredentialId,
      friendlyName: c.FriendlyCredentialName,
      createdAt: c.CreatedAt,
      relyingPartyId: c.RelyingPartyId,
      authenticatorAttachment: c.AuthenticatorAttachment,
    }));
    return { credentials };
  });
}
