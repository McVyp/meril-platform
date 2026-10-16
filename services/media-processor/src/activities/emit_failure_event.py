import os
from temporalio import activity
from src.kafka.producer import emit_event

KAFKA_TOPIC_TRANSCODE = os.environ.get(
    "KAFKA_TOPIC_TRANSCODE", "video.transcode.completed"
)
KAFKA_TOPIC_EMBEDDINGS = os.environ.get("KAFKA_TOPIC_EMBEDDINGS", "video.embeddings")


def _video_id(video_key: str) -> str:
    return video_key.split("/")[1]


@activity.defn
async def emit_transcode_completed(video_key: str, hls_url: str) -> None:
    video_id = _video_id(video_key)
    await emit_event(
        KAFKA_TOPIC_TRANSCODE,
        {
            "eventType": "video.transcode.completed",
            "videoId": video_id,
            "status": "READY",
            "hlsUrl": hls_url,
        },
        key=video_id,
    )


@activity.defn
async def emit_transcode_failed(video_key: str, error_message: str) -> None:
    video_id = _video_id(video_key)
    await emit_event(
        KAFKA_TOPIC_TRANSCODE,
        {
            "eventType": "video.transcode.completed",
            "videoId": video_id,
            "status": "FAILED",
            "hlsUrl": None,
            "errorMessage": error_message,
        },
        key=video_id,
    )


@activity.defn
async def emit_embedding_computed(result: dict) -> None:
    video_id = result["videoId"]
    await emit_event(
        KAFKA_TOPIC_EMBEDDINGS,
        {
            "eventType": "video.embedding.computed",
            "videoId": video_id,
            "embedding": result["embedding"],
            "embeddingHash": result["embeddingHash"],
        },
        key=video_id,
    )
