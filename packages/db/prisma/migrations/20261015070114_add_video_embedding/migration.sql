-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "embedding" vector(384),
ADD COLUMN     "embeddingHash" TEXT;

-- HNSW index for cosine similarity (queires must use <=>)
CREATE INDEX "Video_embedding_hnsw_idx" ON "Video" USING hnsw ("embedding" vector_cosine_ops);