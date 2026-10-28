import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function GET(req: NextRequest) {
  return proxyToGateway(`/api/videos/recommended${req.nextUrl.search}`, {
    requireAuth: false,
  });
}
