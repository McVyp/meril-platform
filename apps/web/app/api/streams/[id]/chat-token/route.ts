import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToGateway(`/api/streams/${id}/chat-token`, {
    method: "POST",
    requireAuth: false,
  });
}
