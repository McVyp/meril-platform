import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function PATCH(req: NextRequest) {
  return proxyToGateway("/api/auth/profile", {
    method: "PATCH",
    body: await req.text(),
  });
}
