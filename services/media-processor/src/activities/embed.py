import asyncio
import hashlib
import os
from functools import lru_cache

import numpy as np
from temporalio import activity

MODEL_ID = os.environ.get(
    "EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
CHUNK_CHARS = 400  # description chars per chunk; title is added to every chunk


@lru_cache(maxsize=1)
def _model():
    from fastembed import TextEmbedding

    return TextEmbedding(MODEL_ID)


def build_text(title: str, description: str | None) -> str:
    parts = [title.strip(), (description or "").strip()]
    return "\n".join(p for p in parts if p)


def embedding_hash(text: str) -> str:
    return hashlib.sha256(f"{MODEL_ID}\n{text}".encode("utf-8")).hexdigest()


def _chunks(title: str, description: str | None) -> list[str]:
    title = title.strip()
    desc = (description or "").strip()
    if not desc:
        return [title]

    pieces: list[str] = []
    start = 0
    while start < len(desc):
        end = min(start + CHUNK_CHARS, len(desc))
        if end < len(desc):
            space = desc.rfind(" ", start, end)

            if space > start + CHUNK_CHARS // 2:
                end = space
        pieces.append(desc[start:end].strip())
        start = end
    return [f"{title}\n{p}" for p in pieces if p]


def embed(title: str, description: str | None) -> list[float]:
    chunks = _chunks(title, description)
    vectors = np.array(list(_model().embed(chunks)))
    mean = vectors.mean(axis=0)
    norm = np.linalg.norm(mean)
    if norm > 0:
        mean = mean / norm
    return [round(float(x), 6) for x in mean]


@activity.defn
async def generate_embedding(
    video_id: str, title: str, description: str | None
) -> dict:
    text = build_text(title, description)
    vector = await asyncio.to_thread(embed, title, description)
    activity.logger.info(f"Embedded video {video_id}: {len(vector)} dims")
    return {
        "videoId": video_id,
        "embedding": vector,
        "embeddingHash": embedding_hash(text),
    }
