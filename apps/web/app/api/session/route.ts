import { NextRequest, NextResponse } from "next/server";
import {
  setSessionCookies,
  getSessionTokens,
  clearSessionCookies,
} from "@/lib/auth/session";
import { decodeJwt } from "jose";

const API_URL = process.env.API_URL;
if (!API_URL) {
  throw new Error("Missing API_URL env var");
}
const FETCH_TIMEOUT_MS = 10_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { idToken, accessToken, refreshToken } = body ?? {};

  if (!idToken || !accessToken) {
    return NextResponse.json(
      { error: "idToken and accessToken are required" },
      { status: 400 },
    );
  }

  await setSessionCookies({ idToken, accessToken, refreshToken });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const { accessToken, idToken } = await getSessionTokens();
  if (!accessToken || !idToken) {
    return NextResponse.json({ loggedIn: false });
  }

  let email: string | null = null;
  try {
    const claims = decodeJwt(idToken);
    email = typeof claims.email === "string" ? claims.email : null;
  } catch (err) {
    console.error("decodeJwt failed:", err);
  }

  let id: string | null = null;
  let name: string | null = null;
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      id = typeof data.id === "string" ? data.id : null;
      name = typeof data.name === "string" ? data.name : null;
      email = data.email ?? email;
    }
  } catch (err) {
    console.error("GET /api/auth/me failed:", err);
  }

  return NextResponse.json({ loggedIn: true, id, email, name });
}

export async function DELETE() {
  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
