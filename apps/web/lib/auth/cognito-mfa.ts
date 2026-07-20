export async function startTotpEnrollment(): Promise<string> {
  const res = await fetch("/api/totp/start", { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not start TOTP setup.");
  return data.secret;
}

export async function verifyTotpCode(code: string): Promise<void> {
  const res = await fetch("/api/totp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error ??
        "Invalid code — check your authenticator app and try again.",
    );
  }
}

export async function getMfaStatus(): Promise<{ totpEnabled: boolean }> {
  const res = await fetch("/api/totp/status");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not check TOTP status.");
  return { totpEnabled: data.totpEnabled };
}
