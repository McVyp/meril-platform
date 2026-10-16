import { db } from "../lib/db";
import { PermanentError } from "../lib/errors";

const EMBEDDING_DIMENSION = 384;

interface EmbeddingComputedEvent {
  eventType: "video.embedding.computed";
  videoId: string;
  embedding: number[];
  embeddingHash: string;
}

export async function handleVideoEmbeddingComputed(raw: string) {
  let event: EmbeddingComputedEvent;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    throw new PermanentError(`Failed to parse event: ${err}`);
  }
  const { videoId, embedding, embeddingHash } = event;

  if (!videoId || !embeddingHash || !Array.isArray(embedding)) {
    throw new PermanentError(
      "Malformed event, missing videoId, embeddingHash or embedding",
    );
  }

  if (
    embedding.length !== EMBEDDING_DIMENSION ||
    !embedding.every((x) => typeof x === "number" && Number.isFinite(x))
  ) {
    throw new PermanentError(
      `Invalid embedding dimension: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`,
    );
  }

  // prisma can't write unsupported columns, so use raw SQL, perform the update manually
  // pgvector accepts the text from "[0.1, 0.2, ...]" cast to ::vector.
  const vectorLiteral = `[${embedding.join(", ")}]`;

  //tagged template literal for raw SQL with pgvector. skips the write if this exact embedding already exists
  const count = await db.$executeRaw`
    UPDATE "Video"
    SET "embedding" = ${vectorLiteral}::vector,
        "embeddingHash" = ${embeddingHash}
    WHERE "id" = ${videoId}
    AND "embeddingHash" IS DISTINCT FROM ${embeddingHash}
    `;

  if (count === 0) {
    console.warn(
      `embedding event for ${videoId} ignored (unchanged hash or video not found)`,
    );
  }
}
