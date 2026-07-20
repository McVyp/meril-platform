import { cookies } from "next/headers";
import { decodeJwt } from "jose";
import { refreshTokens } from "./cognito-refresh";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export interface SessionTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}

export async function setSessionCookies(tokens: SessionTokens) {
  const store = await cookies();
  store.set("idToken", tokens.idToken, COOKIE_OPTS);
  store.set("accessToken", tokens.accessToken, COOKIE_OPTS);
  if (tokens.refreshToken) {
    store.set("refreshToken", tokens.refreshToken, COOKIE_OPTS);
  }
}

function isExpiringSoon(token: string): boolean {
  try {
    const { exp } = decodeJwt(token);
    if (typeof exp !== "number") return true;
    return exp * 1000 - Date.now() < 60_000;
  } catch {
    return true;
  }
}

export async function getSessionTokens(): Promise<Partial<SessionTokens>> {
  const store = await cookies();
  const idToken = store.get("idToken")?.value;
  const accessToken = store.get("accessToken")?.value;
  const refreshToken = store.get("refreshToken")?.value;

  if (!accessToken || !idToken) {
    return { idToken, accessToken, refreshToken };
  }

  if (!isExpiringSoon(accessToken)) {
    return { idToken, accessToken, refreshToken };
  }

  if (!refreshToken) {
    return { idToken, accessToken, refreshToken };
  }

  const refreshed = await refreshTokens(refreshToken);
  if (!refreshed) {
    await clearSessionCookies();
    return {};
  }

  await setSessionCookies({
    idToken: refreshed.idToken,
    accessToken: refreshed.accessToken,
    refreshToken,
  });

  return {
    idToken: refreshed.idToken,
    accessToken: refreshed.accessToken,
    refreshToken,
  };
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete("idToken");
  store.delete("accessToken");
  store.delete("refreshToken");
}
