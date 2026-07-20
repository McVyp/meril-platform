import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function GET() {
  return proxyToGateway("/api/streams", { requireAuth: false });
}

export async function POST(req: NextRequest) {
  return proxyToGateway("/api/streams", {
    method: "POST",
    body: await req.text(),
  });
}
