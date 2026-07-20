import { GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from "@/lib/auth/cognito-server-client";
import { withAccessToken } from "@/lib/auth/with-access-token";

export async function GET() {
  return withAccessToken(async (accessToken) => {
    const res = await cognitoClient.send(
      new GetUserCommand({ AccessToken: accessToken }),
    );
    const settings = res.UserMFASettingList ?? [];
    return { totpEnabled: settings.includes("SOFTWARE_TOKEN_MFA") };
  });
}
