import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function POST(req: NextRequest) {
  return proxyToGateway("/api/videos", {
    method: "POST",
    body: await req.text(),
  });
}
