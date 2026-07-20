import { RespondToAuthChallengeCommand } from "@aws-sdk/client-cognito-identity-provider";
import {
  cognitoClient,
  CLIENT_ID,
  toTokens,
  type AuthChallengeResult,
} from "./cognito-client";

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function signInWithPasskey(
  email: string,
  session: string,
): Promise<AuthChallengeResult> {
  const selectResponse = await cognitoClient.send(
    new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: "SELECT_CHALLENGE",
      Session: session,
      ChallengeResponses: { USERNAME: email, ANSWER: "WEB_AUTHN" },
    }),
  );

  const optionsJson =
    selectResponse.ChallengeParameters?.CREDENTIAL_REQUEST_OPTIONS;
  if (!optionsJson || !selectResponse.Session) {
    throw new Error(
      "Cognito did not return WebAuthn credential request options.",
    );
  }
  const options = JSON.parse(optionsJson);

  const credential = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      allowCredentials: options.allowCredentials?.map((c: { id: string }) => ({
        id: base64urlToBuffer(c.id),
        type: "public-key" as const,
      })),
    },
  })) as PublicKeyCredential | null;

  if (!credential)
    throw new Error("No passkey credential returned by the browser.");

  const response = credential.response as AuthenticatorAssertionResponse;
  const finishResponse = await cognitoClient.send(
    new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: "WEB_AUTHN",
      Session: selectResponse.Session,
      ChallengeResponses: {
        USERNAME: email,
        CREDENTIAL: JSON.stringify({
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            authenticatorData: bufferToBase64url(response.authenticatorData),
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            signature: bufferToBase64url(response.signature),
            userHandle: response.userHandle
              ? bufferToBase64url(response.userHandle)
              : null,
          },
        }),
      },
    }),
  );

  return { tokens: toTokens(finishResponse.AuthenticationResult) };
}

export async function registerPasskey(): Promise<void> {
  const startRes = await fetch("/api/passkey/register/start", {
    method: "POST",
  });
  const startData = await startRes.json().catch(() => ({}));
  if (!startRes.ok)
    throw new Error(startData.error ?? "Could not start passkey registration.");

  const options = startData.options as {
    challenge: string;
    rp: { name: string; id?: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: Array<{ type: "public-key"; alg: number }>;
    excludeCredentials?: Array<{ id: string; type: "public-key" }>;
    [key: string]: unknown;
  };

  const credential = (await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      user: {
        id: base64urlToBuffer(options.user.id),
        name: options.user.name,
        displayName: options.user.displayName,
      },
      excludeCredentials: options.excludeCredentials?.map((c) => ({
        id: base64urlToBuffer(c.id),
        type: "public-key" as const,
      })),
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey creation was cancelled or failed.");

  const response = credential.response as AuthenticatorAttestationResponse;
  const completeRes = await fetch("/api/passkey/register/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(response.attestationObject),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
        },
      },
    }),
  });

  const completeData = await completeRes.json().catch(() => ({}));
  if (!completeRes.ok) {
    throw new Error(
      completeData.error ?? "Could not complete passkey registration.",
    );
  }
}

export interface PasskeyCredential {
  credentialId: string;
  friendlyName?: string;
  createdAt?: string;
  relyingPartyId?: string;
  authenticatorAttachment?: string;
}

export async function listPasskeys(): Promise<PasskeyCredential[]> {
  const res = await fetch("/api/passkey/list");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load passkeys.");
  return data.credentials ?? [];
}

export async function deletePasskey(credentialId: string): Promise<void> {
  const res = await fetch(`/api/passkey/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not remove passkey.");
}
