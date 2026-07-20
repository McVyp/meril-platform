import { NextResponse } from "next/server";
import { getSessionTokens } from "@/lib/auth/session";

export async function withAccessToken<T>(
  handler: (accessToken: string) => Promise<T>,
): Promise<NextResponse> {
  const { accessToken } = await getSessionTokens();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    return NextResponse.json(await handler(accessToken));
  } catch (err) {
    console.error("withAccessToken handler failed:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
