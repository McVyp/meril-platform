import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToGateway(`/api/streams/${id}`, { requireAuth: false });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToGateway(`/api/streams/${id}`, {
    method: "PATCH",
    body: await req.text(),
  });
}
