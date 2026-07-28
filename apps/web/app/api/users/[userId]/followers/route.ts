import { NextRequest } from "next/server";
import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const qs = req.nextUrl.searchParams.toString();
  return proxyToGateway(`/api/users/${userId}/followers${qs ? `?${qs}` : ""}`, {
    requireAuth: false,
  });
}
