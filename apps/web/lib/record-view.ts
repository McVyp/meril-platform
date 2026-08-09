export function recordView(videoId: string) {
  fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch((err) =>
    console.error("Failed to record view:", err),
  );
}
