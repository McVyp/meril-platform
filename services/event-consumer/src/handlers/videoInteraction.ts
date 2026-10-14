import { db } from "../lib/db";
import { PermanentError } from "../lib/errors";

interface VideoInteractionEvent {
  eventType: "video.interaction";
  eventId: string;
  userId: string | null;
  sessionId: string | null;
  videoId: string;
  watchedDuration: number;
  duration: number;
  occurredAt: string;
}

export async function handleVideoInteraction(raw: string) {
  let event: VideoInteractionEvent;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    throw new PermanentError("Failed to parse video interaction event");
  }

  const {
    eventId,
    userId,
    sessionId,
    videoId,
    watchedDuration,
    duration,
    occurredAt,
  } = event;

  if (!eventId || !videoId || (!userId && !sessionId)) {
    throw new PermanentError(
      "video.interaction missing eventId, videoId, userId or sessionId",
    );
  }
  if (
    !Number.isFinite(watchedDuration) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new PermanentError(
      "video.interaction has invalid watchedDuration or duration",
    );
  }

  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) {
    throw new PermanentError("video.interaction has invalid occurredAt");
  }

  try {
    await db.interaction.create({
      data: {
        eventId,
        userId,
        sessionId,
        videoId,
        watchedDuration: Math.round(watchedDuration),
        duration: Math.round(duration),
        occurredAt: at,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") return;
    throw err;
  }
}
