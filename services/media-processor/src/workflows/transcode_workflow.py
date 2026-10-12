from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

with workflow.unsafe.imports_passed_through():
    from src.activities.transcode import transcode_to_hls
    from src.activities.emit_failure_event import (
        emit_transcode_failed,
        emit_transcode_completed
    )

EMIT_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=5)
)
@workflow.defn
class TranscodeWorkflow:
    @workflow.run
    async def run(self, video_key: str) -> str:
        try:
            hls_url = await workflow.execute_activity(
                transcode_to_hls,
                video_key,
                start_to_close_timeout=timedelta(minutes=30),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
        except ActivityError as e:
            await workflow.execute_activity(
                emit_transcode_failed,
                args=[video_key, str(e)],
                start_to_close_timeout=timedelta(seconds=30),
                schedule_to_close_timeout=timedelta(days=1),
                retry_policy=EMIT_RETRY,
            )
            raise
        
        await workflow.execute_activity(
            emit_transcode_completed,
            args=[video_key, hls_url],
            start_to_close_timeout=timedelta(seconds=30),
            schedule_to_close_timeout=timedelta(days=1),
            retry_policy=EMIT_RETRY
        )
        return hls_url