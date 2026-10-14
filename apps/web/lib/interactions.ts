const SESSION_KEY = "meril_sessionId";

// anonymous id for the current user session, so guests get personalized feeds too.
export function getSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function sendView(
  videoId: string,
  watchedDuration: number,
  duration: number,
) {
  if (!Number.isFinite(duration) || duration <= 0 || watchedDuration <= 0)
    return;

  const body = JSON.stringify({
    sessionId: getSessionId(),
    events: [
      {
        eventId: crypto.randomUUID(),
        videoId,
        watchedDuration,
        duration,
        occurredAt: new Date().toISOString(),
      },
    ],
  });
  fetch("/api/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {});
}
