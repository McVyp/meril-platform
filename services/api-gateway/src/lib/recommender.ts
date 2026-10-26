import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { RecommenderService } from "../gen/meril/recommender/v1/recommender_pb";

const transport = createGrpcTransport({
  baseUrl: process.env.RECOMMENDER_URL ?? "http://localhost:50051",
});
const client = createClient(RecommenderService, transport);

export async function getRecommendations(
  params: { userId?: string; sessionId?: string; limit?: number },
  timeoutMs = 300,
): Promise<string[]> {
  const res = await client.getRecommendations(
    {
      userId: params.userId ?? "",
      sessionId: params.sessionId ?? "",
      limit: params.limit ?? 0,
    },
    { timeoutMs },
  );
  return res.items.map((item) => item.videoId);
}
