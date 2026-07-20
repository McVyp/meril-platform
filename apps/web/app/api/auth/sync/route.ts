import { proxyToGateway } from "@/lib/proxy-to-gateway";

export async function POST() {
  return proxyToGateway("/api/auth/sync", { method: "POST", useIdToken: true });
}
