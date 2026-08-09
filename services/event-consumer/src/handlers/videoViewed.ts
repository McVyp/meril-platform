import { db } from "../lib/db";

interface VideoViewedEvent {
  eventType: "video.viewed";
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
    console.error("Failed to parse video.viewed message:", err);
    return;
  }

  const { videoId, viewerId } = event;
  if (!videoId) {
    console.error("Malformed video.viewed event, missing videoId:", event);
    return;
  }

  try {
    await db.$transaction([
      db.video.update({
        where: { id: videoId },
        data: { viewCount: { increment: 1 } },
      }),
      db.view.create({
        data: { videoId, viewerId: viewerId ?? null },
      }),
    ]);
  } catch (err) {
    console.error(`Failed to record view for ${videoId}:`, err);
  }
}
