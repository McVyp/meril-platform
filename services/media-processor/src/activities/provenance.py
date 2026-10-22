import asyncio
import json
import mimetypes
import os
import tempfile

import boto3
from temporalio import activity

S3_RAW_BUCKET = os.environ.get("S3_RAW_BUCKET")
AWS_REGION = os.environ.get("AWS_REGION")

# IPTC digital source types that C2PA uses to declare AI-generated content.
AI_SOURCE_TYPES = (
    "trainedAlgorithmicMedia",
    "compositeWithTrainedAlgorithmicMedia",
)


def _read_manifest_store(path: str, mime: str) -> str | None:
    """returns the C2PA manifest store as JSON, or None if the file has none."""
    import c2pa

    try:
        with open(path, "rb") as f:
            reader = c2pa.Reader(mime, f)
            return reader.json()
    except Exception as e:
        if "ManifestNotFound" in type(e).__name__ or "ManifestNotFound" in str(e):
            return None
        raise


def inspect_file(path: str, mime: str = "video/mp4") -> dict:
    store_json = _read_manifest_store(path, mime)
    if store_json is None:
        return {"hasManifest": False, "aiGenerated": False, "generator": None}

    store = json.loads(store_json)
    active = store.get("manifests", {}).get(store.get("active_manifest"), {})
    active_json = json.dumps(active)

    generator = active.get("claim_generator")
    if not generator:
        info = active.get("claim_generator_info") or [{}]
        generator = info[0].get("name")

    return {
        "hasManifest": True,
        "aiGenerated": any(t in active_json for t in AI_SOURCE_TYPES),
        "generator": generator,
    }


@activity.defn
async def check_provenance(video_key: str) -> dict:
    """downloads the raw upload and reads its C2PA content credentials"""
    s3 = boto3.client("s3", region_name=AWS_REGION)
    mime = mimetypes.guess_type(video_key)[0] or "video/mp4"

    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "input")
        await asyncio.to_thread(s3.download_file, S3_RAW_BUCKET, video_key, path)
        result = await asyncio.to_thread(inspect_file, path, mime)
    activity.logger.info(f"C2PA check for {video_key}: {result}")
    return result
