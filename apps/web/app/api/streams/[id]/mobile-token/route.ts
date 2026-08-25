import { proxyToGateway } from "@/lib/proxy-to-gateway";
import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToGateway(`/api/streams/${id}/mobile-token`);
}
