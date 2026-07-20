import { syncUserProfile } from "./sync";

interface RawTokens {
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
}

/** call after any successful sign-in (password, MFA, or passkey) instead of touching sessionStorage directly. */
export async function completeLogin(tokens: RawTokens): Promise<void> {
  if (!tokens.idToken || !tokens.accessToken) {
    throw new Error("Sign-in did not return the expected tokens.");
  }

  let res: Response;
  try {
    res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens),
    });
  } catch (err) {
    console.error("Session request failed:", err);
    throw new Error("Could not establish session.");
  }
  if (!res.ok) {
    throw new Error("Could not establish session.");
  }

  await syncUserProfile();
}
