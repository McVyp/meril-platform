import { NextRequest } from "next/server";
import { proxyToGateway, getClientIp } from "@/lib/proxy-to-gateway";

export async function POST(req: NextRequest) {
  return proxyToGateway(`/api/interactions`, {
    method: "POST",
    requireAuth: false,
    clientKey: getClientIp(req),
    body: await req.text(),
  });
}
