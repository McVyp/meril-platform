import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  type AuthenticationResultType,
} from "@aws-sdk/client-cognito-identity-provider";

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

export type AuthChallengeResult = {
  session?: string;
  availableChallenges?: string[];
  tokens?: {
    idToken?: string;
    accessToken?: string;
    refreshToken?: string;
  };
};

export function toTokens(result?: AuthenticationResultType) {
  return {
    idToken: result?.IdToken,
    accessToken: result?.AccessToken,
    refreshToken: result?.RefreshToken,
  };
}

// sign-up
export async function signUp(email: string, password: string) {
  return cognitoClient.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }],
    }),
  );
}

export async function confirmSignUp(email: string, code: string) {
  return cognitoClient.send(
    new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    }),
  );
}

export async function resendConfirmationCode(email: string) {
  return cognitoClient.send(
    new ResendConfirmationCodeCommand({ ClientId: CLIENT_ID, Username: email }),
  );
}

// sign-in
export async function startSignIn(email: string): Promise<AuthChallengeResult> {
  const response = await cognitoClient.send(
    new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "USER_AUTH",
      AuthParameters: { USERNAME: email },
    }),
  );

  return {
    session: response.Session,
    availableChallenges: response.AvailableChallenges,
  };
}

export async function signInWithPassword(
  email: string,
  password: string,
  session: string,
): Promise<AuthChallengeResult> {
  const response = await cognitoClient.send(
    new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: "SELECT_CHALLENGE",
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        ANSWER: "PASSWORD",
        PASSWORD: password,
      },
    }),
  );

  // MFA-enabled users get a SOFTWARE_TOKEN_MFA challenge back here instead of tokens — handled by respondToMfaCode.
  if (response.ChallengeName) {
    return {
      session: response.Session,
      availableChallenges: [response.ChallengeName],
    };
  }

  return { tokens: toTokens(response.AuthenticationResult) };
}

export async function respondToMfaCode(
  email: string,
  code: string,
  session: string,
): Promise<AuthChallengeResult> {
  const response = await cognitoClient.send(
    new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: "SOFTWARE_TOKEN_MFA",
      Session: session,
      ChallengeResponses: { USERNAME: email, SOFTWARE_TOKEN_MFA_CODE: code },
    }),
  );

  return { tokens: toTokens(response.AuthenticationResult) };
}

// forgot password
export async function forgotPassword(email: string) {
  return cognitoClient.send(
    new ForgotPasswordCommand({ ClientId: CLIENT_ID, Username: email }),
  );
}

/** password changes immediately on success — no confirm step, user can log in right away. */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
) {
  return cognitoClient.send(
    new ConfirmForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }),
  );
}
