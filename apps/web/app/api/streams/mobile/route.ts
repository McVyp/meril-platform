import { proxyToGateway } from "@/lib/proxy-to-gateway";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  return proxyToGateway("/api/streams/mobile", {
    method: "POST",
    body: await req.text(),
  });
}
