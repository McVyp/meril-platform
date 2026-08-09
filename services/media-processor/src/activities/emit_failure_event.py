import os
from temporalio import activity
from src.kafka.producer import emit_event

KAFKA_TOPIC_TRANSCODE = os.environ.get("KAFKA_TOPIC_TRANSCODE", "video.transcode.completed")

@activity.defn
async def emit_transcode_failed(video_key: str, error_message: str) -> None:
    real_video_id = video_key.split("/")[1]

    await emit_event(KAFKA_TOPIC_TRANSCODE, {
        "eventType": "video.transcode.completed",
        "videoId": real_video_id,
        "status": "FAILED",
        "hlsUrl": None,
        "errorMessage": error_message,
    })