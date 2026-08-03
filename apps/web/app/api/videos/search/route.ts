import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyToGateway(`/api/videos/search${qs ? `?${qs}` : ""}`, {
    requireAuth: false,
  });
}
