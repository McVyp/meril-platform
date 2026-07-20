import { NextResponse } from "next/server";
import { getSessionTokens } from "@/lib/auth/session";

const API_URL = process.env.API_URL;
if (!API_URL) {
  throw new Error("Missing API_URL env var");
}

const TIMEOUT_MS = 10_000;

interface ProxyOptions {
  method?: string;
  body?: BodyInit;
  requireAuth?: boolean;
  useIdToken?: boolean;
}

export async function proxyToGateway(path: string, opts: ProxyOptions = {}) {
  const { method = "GET", body, requireAuth = true, useIdToken = false } = opts;

  const { accessToken, idToken } = await getSessionTokens();
  const token = useIdToken ? idToken : accessToken;

  if (requireAuth && !token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`proxyToGateway ${method} ${path} failed:`, err);
    return NextResponse.json(
      { error: "Gateway request failed" },
      { status: 502 },
    );
  }
}
