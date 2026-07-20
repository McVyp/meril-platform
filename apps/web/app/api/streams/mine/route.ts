import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function GET() {
  return proxyToGateway("/api/streams/mine");
}
