import { NextRequest } from "next/server";
import { proxyToGateway, getClientIp } from "@/lib/proxy-to-gateway";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToGateway(`/api/videos/${id}/view`, {
    method: "POST",
    requireAuth: false,
    clientKey: getClientIp(req),
  });
}
