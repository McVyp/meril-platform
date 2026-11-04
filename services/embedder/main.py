import os
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, Request
from fastembed import TextEmbedding
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get(
    "EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = TextEmbedding(MODEL_ID)
    yield


app = FastAPI(lifespan=lifespan)


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class EmbedResponse(BaseModel):
    embedding: list[float]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed")
def embed(body: EmbedRequest, request: Request) -> EmbedResponse:
    vector = next(iter(request.app.state.model.embed([body.text.strip()])))
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return EmbedResponse(embedding=[round(float(x), 6) for x in vector])
