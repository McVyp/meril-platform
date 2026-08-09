import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from temporalio.client import Client
from temporalio.worker import Worker

from src.activities.transcode import transcode_to_hls
from src.activities.emit_failure_event import emit_transcode_failed
from src.workflows.transcode_workflow import TranscodeWorkflow

TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "default")
TEMPORAL_API_KEY = os.environ.get("TEMPORAL_API_KEY")
TASK_QUEUE = "media-processor"

async def main():
    connect_kwargs = dict(namespace=TEMPORAL_NAMESPACE)
    if TEMPORAL_API_KEY:
        connect_kwargs["api_key"] = TEMPORAL_API_KEY
        connect_kwargs["tls"] = True

    client = await Client.connect(TEMPORAL_HOST, **connect_kwargs)
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[TranscodeWorkflow],
        activities=[transcode_to_hls, emit_transcode_failed]
    )
    print(f"Worker started on task queue: {TASK_QUEUE}")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())