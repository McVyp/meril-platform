import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from temporalio.client import Client
from temporalio.worker import Worker

from src.activities.transcode import transcode_to_hls
from src.activities.embed import generate_embedding, embed
from src.activities.emit_failure_event import (
    emit_transcode_failed,
    emit_transcode_completed,
    emit_embedding_computed,
)
from src.workflows.transcode_workflow import TranscodeWorkflow
from src.workflows.embed_video_workflow import EmbedVideoWorkflow

TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = "media-processor"

EXPECTED_EMBEDDING_DIMENSION = 384


async def warm_up_emebedding_model() -> None:
    vector = await asyncio.to_thread(embed, "warm-up", None)
    if len(vector) != EXPECTED_EMBEDDING_DIMENSION:
        raise RuntimeError(
            f"Embedding model outputs {len(vector)} dims, "
            f"but the DB column is vector({EXPECTED_EMBEDDING_DIMENSION})"
        )
    print(f"Embedding model ready ({len(vector)} dims)")


async def main():
    await warm_up_emebedding_model()

    connect_kwargs = dict(namespace=TEMPORAL_NAMESPACE)
    client = await Client.connect(TEMPORAL_HOST, **connect_kwargs)
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[TranscodeWorkflow, EmbedVideoWorkflow],
        activities=[
            transcode_to_hls,
            emit_transcode_completed,
            emit_transcode_failed,
            generate_embedding,
            emit_embedding_computed,
        ],
    )
    print(f"Worker started on task queue: {TASK_QUEUE}")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
