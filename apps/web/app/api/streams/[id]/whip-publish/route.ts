import { proxyToGateway } from "@/lib/proxy-to-gateway";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToGateway(`/api/streams/${id}/whip-publish`, {
    method: "POST",
    body: await req.text(),
  });
}
