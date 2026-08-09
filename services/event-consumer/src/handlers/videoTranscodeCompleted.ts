import { db } from "../lib/db";

interface TranscodeCompletedEvent {
  eventType: "video.transcode.completed";
  timestamp: string;
  videoId: string;
  status: "READY" | "FAILED";
  hlsUrl: string | null;
  errorMessage?: string | null;
}

export async function handleVideoTranscodeCompleted(raw: string) {
  let event: TranscodeCompletedEvent;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse video.transcode.completed message:", err);
    return;
  }

  const { videoId, status, hlsUrl } = event;

  if (!videoId || !status) {
    console.error("Malformed event, missing videoId or status:", event);
    return;
  }

  try {
    await db.video.update({
      where: { id: videoId },
      data: {
        status,
        ...(status === "READY" && { hlsUrl }),
      },
    });
  } catch (err) {
    console.error(`Failed to update video ${videoId}:`, err);
  }
}
