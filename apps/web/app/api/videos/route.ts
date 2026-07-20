import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function GET(req: NextRequest) {
  return proxyToGateway(`/api/videos${req.nextUrl.search}`, {
    requireAuth: false,
  });
}

export async function POST(req: NextRequest) {
  return proxyToGateway("/api/videos", {
    method: "POST",
    body: await req.text(),
  });
}
