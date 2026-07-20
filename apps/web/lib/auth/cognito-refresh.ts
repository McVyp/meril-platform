import { InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient, CLIENT_ID } from "./cognito-server-client";

export interface RefreshedTokens {
  idToken: string;
  accessToken: string;
}

/**
 * Returns fresh tokens, or null if the refresh token itself is invalid/expired
 * — caller should treat null as "session is over, clear cookies."
 */
export async function refreshTokens(
  refreshToken: string,
): Promise<RefreshedTokens | null> {
  try {
    const response = await cognitoClient.send(
      new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );

    const result = response.AuthenticationResult;
    if (!result?.IdToken || !result?.AccessToken) return null;

    return { idToken: result.IdToken, accessToken: result.AccessToken };
  } catch (err) {
    console.error("Token refresh failed:", err);
    return null;
  }
}
