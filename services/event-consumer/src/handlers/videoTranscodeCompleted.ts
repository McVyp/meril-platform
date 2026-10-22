import { db } from "../lib/db";
import { PermanentError } from "../lib/errors";

interface TranscodeCompletedEvent {
  eventType: "video.transcode.completed";
  timestamp: string;
  videoId: string;
  status: "READY" | "FAILED";
  hlsUrl: string | null;
  errorMessage?: string | null;
  provenance?: {
    hasManifest: boolean;
    aiGenerated: boolean;
    generator: string | null;
  };
}

export async function handleVideoTranscodeCompleted(raw: string) {
  let event: TranscodeCompletedEvent;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    throw new PermanentError(
      "invalid JSON in video.transcode.completed message",
    );
  }

  const { videoId, status, hlsUrl, provenance } = event;

  if (!videoId || (status !== "READY" && status !== "FAILED")) {
    throw new PermanentError(
      "Malformed event, missing videoId or valid status:",
    );
  }

  const result = await db.video.updateMany({
    where: { id: videoId, status: { in: ["PROCESSING", "TRANSCODING"] } },
    data: {
      status,
      ...(status === "READY" && { hlsUrl }),
    },
  });

  if (provenance) {
    await db.video.updateMany({
      where: { id: videoId },
      data: {
        provenance,
        ...(provenance.aiGenerated && { isAiGenerated: true }),
      },
    });
  }

  if (result.count === 0) {
    console.warn(
      `transcode event for ${videoId} ignored (already final or not found)`,
    );
  }
}
