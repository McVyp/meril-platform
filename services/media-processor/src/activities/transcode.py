import asyncio
import os
import tempfile
import boto3
import ffmpeg
from temporalio import activity
from src.kafka.producer import emit_event

S3_RAW_BUCKET = os.environ.get("S3_RAW_BUCKET", "meril-raw")
S3_HLS_BUCKET = os.environ.get("S3_HLS_BUCKET", "meril-hls")
AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-1")
CLOUDFRONT_DOMAIN = os.environ.get("CLOUDFRONT_DOMAIN")
KAFKA_TOPIC_TRANSCODE = os.environ.get("KAFKA_TOPIC_TRANSCODE", "video.transcode.completed")


@activity.defn
async def transcode_to_hls(video_key: str) -> str:
    """
    Downloads raw MP4 from meril-raw, transcodes to multi-bitrate HLS,
    uploads segments + playlists to meril-hls.
    Returns the S3 key of the master playlist.
    """
    s3 = boto3.client("s3", region_name=AWS_REGION)

    # video_key is "raw/{videoId}/{fileName}" — the real DB id is the
    # path segment, not the filename (filename was previously used by
    # mistake and doesn't match the actual Video row's id).
    real_video_id = video_key.split("/")[1]
    video_id = os.path.splitext(os.path.basename(video_key))[0]

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, "input.mp4")
        output_dir = os.path.join(tmpdir, "hls")
        os.makedirs(output_dir)

        activity.logger.info(f"Downloading s3://{S3_RAW_BUCKET}/{video_key}")
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: s3.download_file(S3_RAW_BUCKET, video_key, input_path)
        )

        activity.logger.info("Transcoding to HLS...")
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: _run_ffmpeg(input_path, output_dir, video_id)
        )

        activity.logger.info("Uploading HLS output to S3...")
        for root, _, files in os.walk(output_dir):
            for file in files:
                local_path = os.path.join(root, file)
                s3_key = f"hls/{video_id}/{file}"
                content_type = "application/x-mpegURL" if file.endswith(".m3u8") else "video/MP2T"
                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda lp=local_path, sk=s3_key, ct=content_type: s3.upload_file(
                        lp, S3_HLS_BUCKET, sk, ExtraArgs={"ContentType": ct}
                    ),
                )

    master_key = f"hls/{video_id}/master.m3u8"
    hls_url = f"https://{CLOUDFRONT_DOMAIN}/{master_key}"
    activity.logger.info(f"Done. Master playlist: s3://{S3_HLS_BUCKET}/{master_key}")

    await emit_event(KAFKA_TOPIC_TRANSCODE, {
        "eventType": "video.transcode.completed",
        "videoId": real_video_id,
        "status": "READY",
        "hlsUrl": hls_url,
    })

    return master_key


def _run_ffmpeg(input_path: str, output_dir: str, video_id: str) -> None:
    """Multi-bitrate HLS transcode - 3 renditions: 1080p, 720p, 360p"""
    master_playlist = os.path.join(output_dir, "master.m3u8")

    renditions = [
        {"height": 1080, "bitrate": "5000k", "name": "1080p"},
        {"height": 720, "bitrate": "2800k", "name": "720p"},
        {"height": 360, "bitrate": "800k", "name": "360p"},
    ]

    variant_lines = ["#EXTM3U", "#EXT-X-VERSION:3"]

    for r in renditions:
        playlist_path = os.path.join(output_dir, f"{r['name']}.m3u8")
        segment_pattern = os.path.join(output_dir, f"{r['name']}_%03d.ts")

        (
            ffmpeg
            .input(input_path)
            .output(
                playlist_path,
                vf=f"scale=-2:{r['height']}",
                video_bitrate=r["bitrate"],
                audio_bitrate="128k",
                hls_time=6,
                hls_list_size=0,
                hls_segment_filename=segment_pattern,
                format="hls",
            )
            .overwrite_output()
            .run(quiet=True)
        )

        bandwidth = int(r["bitrate"].replace("k", "")) * 1000
        width = {1080: 1920, 720: 1280, 360: 640}[r["height"]]
        variant_lines.append(f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={width}x{r["height"]}')
        variant_lines.append(f"{r['name']}.m3u8")

    with open(master_playlist, "w") as f:
        f.write("\n".join(variant_lines))