import { AssociateSoftwareTokenCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "@/lib/auth/cognito-server-client";
import { withAccessToken } from "@/lib/auth/with-access-token";

export async function POST() {
  return withAccessToken(async (accessToken) => {
    const res = await cognitoClient.send(
      new AssociateSoftwareTokenCommand({ AccessToken: accessToken }),
    );
    if (!res.SecretCode)
      throw new Error("Cognito did not return a TOTP secret");
    return { secret: res.SecretCode };
  });
}
