import { StartWebAuthnRegistrationCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "@/lib/auth/cognito-server-client";
import { withAccessToken } from "@/lib/auth/with-access-token";

export async function POST() {
  return withAccessToken(async (accessToken) => {
    const res = await cognitoClient.send(
      new StartWebAuthnRegistrationCommand({ AccessToken: accessToken }),
    );
    if (!res.CredentialCreationOptions) {
      throw new Error("Cognito did not return credential creation options");
    }
    return { options: res.CredentialCreationOptions };
  });
}
