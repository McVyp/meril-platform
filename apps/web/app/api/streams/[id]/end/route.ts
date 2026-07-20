import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToGateway(`/api/streams/${id}/end`, { method: "PUT" });
}
