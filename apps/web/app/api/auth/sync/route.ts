import type { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyToGateway("/api/auth/sync", {
    method: "POST",
    useIdToken: true,
    body: body || undefined,
  });
}
