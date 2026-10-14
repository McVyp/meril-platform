import { NextRequest } from "next/server";
import {
  proxyToGateway,
  getClientIp,
  getClientCountry,
} from "@/lib/proxy-to-gateway";

export async function POST(req: NextRequest) {
  return proxyToGateway(`/api/interactions`, {
    method: "POST",
    requireAuth: false,
    clientKey: getClientIp(req),
    clientCountry: getClientCountry(req),
    body: await req.text(),
  });
}
