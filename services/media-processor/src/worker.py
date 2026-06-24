import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from temporalio.client import Client
from temporalio.worker import Worker

from src.activities.transcode import transcode_to_hls
from src.workflows.transcode_workflow import TranscodeWorkflow


TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
TASK_QUEUE = "media-processor"

async def main():
    client = await Client.connect(TEMPORAL_HOST)
    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[TranscodeWorkflow],
        activities=[transcode_to_hls]
    )
    print(f"Worker started on task queue: {TASK_QUEUE}")
    await worker.run()
    
if __name__ == "__main__":
    asyncio.run(main())