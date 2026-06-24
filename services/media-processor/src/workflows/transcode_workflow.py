from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from src.activities.transcode import transcode_to_hls
    
@workflow.defn
class TranscodeWorkflow:
    @workflow.run
    async def run(self, video_key: str) -> str:
        return await workflow.execute_activity(
            transcode_to_hls,
            video_key,
            start_to_close_timeout = timedelta(minutes=30),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
        
