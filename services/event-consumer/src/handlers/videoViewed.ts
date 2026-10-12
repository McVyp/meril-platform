import { db } from "../lib/db";
import { PermanentError } from "../lib/errors";

interface VideoViewedEvent {
  eventType: "video.viewed";
  eventId?: string;
  videoId: string;
  viewerId?: string | null;
  creatorId?: string | null;
  timestamp: string;
}

export async function handleVideoViewed(raw: string) {
  let event: VideoViewedEvent;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    throw new PermanentError("invalid JSON in video.viewed message");
  }

  const { videoId, viewerId, eventId } = event;
  if (!videoId) {
    console.error("Malformed video.viewed event, missing videoId");
    return;
  }

  try {
    await db.$transaction([
      db.view.create({
        data: { eventId: eventId ?? null, videoId, viewerId: viewerId ?? null},
      }),
      db.video.update({
        where: { id: videoId },
        data: { viewCount: { increment: 1 } },
      }),
    ]);
  } catch (err: any) {
    if (err?.code === "P2022") return;
    if (err?.code === "P2025") throw new PermanentError(`video ${videoId} not found`);
    throw err;
  }
}
