/** call after /api/session has set cookies — the proxy reads idToken from the cookie server-side. */
export async function syncUserProfile(): Promise<void> {
  try {
    const res = await fetch("/api/auth/sync", { method: "POST" });
    if (!res.ok) console.error("Profile sync failed:", await res.text());
  } catch (err) {
    console.error("Profile sync request failed:", err);
  }
}
