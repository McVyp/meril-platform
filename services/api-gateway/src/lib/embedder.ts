import { z } from "zod";

const EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://localhost:8001";
const TIMEOUT_MS = 300;

// 384 = paraphrase-multilingual-MiniLM-L12-v2, same as the video embeddings
const responseSchema = z.object({
  embedding: z.array(z.number()).length(384),
});

export async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(`${EMBEDDER_URL}/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Failed to embed text: ${res.status} ${res.statusText}`);
  }
  return responseSchema.parse(await res.json()).embedding;
}
