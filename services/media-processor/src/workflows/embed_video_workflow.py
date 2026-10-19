from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy


with workflow.unsafe.imports_passed_through():
    from src.activities.embed import generate_embedding
    from src.activities.emit_failure_event import emit_embedding_computed
    from src.workflows.transcode_workflow import EMIT_RETRY


@workflow.defn
class EmbedVideoWorkflow:
    """
    embed one video's title + description and emit it to Kafka.

    started with workflow ID "embed-<videoId>" by the backfill (and later by video edits), newer run for the same video replaces an older one
    """

    @workflow.run
    async def run(
        self, video_id: str, title: str, description: str | None = None
    ) -> None:
        result = await workflow.execute_activity(
            generate_embedding,
            args=[video_id, title, description],
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
        await workflow.execute_activity(
            emit_embedding_computed,
            result,
            start_to_close_timeout=timedelta(seconds=30),
            schedule_to_close_timeout=timedelta(hours=1),
            retry_policy=EMIT_RETRY,
        )
