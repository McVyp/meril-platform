"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  registerPasskey,
  listPasskeys,
  deletePasskey,
  type PasskeyCredential,
} from "@/lib/auth/cognito-passkey";
import {
  startTotpEnrollment,
  verifyTotpCode,
  getMfaStatus,
} from "@/lib/auth/cognito-mfa";
import { useSession } from "@/context/SessionContext";

export function SecuritySection() {
  const { email } = useSession();
  const userLabel = email ?? "you";
  return (
    <div className="flex flex-col gap-6 p-1">
      <PasskeySection />
      <TotpSection userLabel={userLabel} />
    </div>
  );
}

function formatCredentialLabel(cred: PasskeyCredential): string {
  if (cred.friendlyName) return cred.friendlyName;
  if (cred.authenticatorAttachment === "platform") return "This device";
  if (cred.authenticatorAttachment === "cross-platform") return "Security key";
  return "Passkey";
}

function formatCreatedAt(date?: string): string | null {
  if (!date) return null;
  try {
    return `Added ${new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`;
  } catch {
    return null;
  }
}

function PasskeySection() {
  const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
  const [listStatus, setListStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [addStatus, setAddStatus] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadCredentials() {
    setListStatus("loading");
    try {
      const creds = await listPasskeys();
      setCredentials(creds);
      setListStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load passkeys.");
      setListStatus("error");
    }
  }

  useEffect(() => {
    loadCredentials();
  }, []);

  async function handleAddPasskey() {
    setAddStatus("loading");
    setError(null);
    try {
      await registerPasskey();
      setAddStatus("idle");
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add passkey.");
      setAddStatus("error");
    }
  }

  async function handleDelete(credentialId: string) {
    setDeletingId(credentialId);
    setError(null);
    try {
      await deletePasskey(credentialId);
      setCredentials((prev) =>
        prev.filter((c) => c.credentialId !== credentialId),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove passkey.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h3 className="mb-1 text-[1.2rem] font-medium">Passkey</h3>
      <p className="mb-3 text-[1rem] text-muted-foreground">
        Sign in with Face ID, Touch ID, or a security key instead of a password.
      </p>

      {listStatus === "loading" && (
        <p className="mb-3 text-[1.2rem] text-muted-foreground">
          Loading passkeys...
        </p>
      )}

      {listStatus === "loaded" && credentials.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {credentials.map((cred) => {
            const createdLabel = formatCreatedAt(cred.createdAt);
            return (
              <li
                key={cred.credentialId}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm">{formatCredentialLabel(cred)}</p>
                  {createdLabel && (
                    <p className="text-xs text-muted-foreground">
                      {createdLabel}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(cred.credentialId)}
                  disabled={deletingId === cred.credentialId}
                  className="text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  {deletingId === cred.credentialId ? "Removing..." : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-center w-full mx-auto">
        <Button
          type="button"
          onClick={handleAddPasskey}
          disabled={addStatus === "loading"}
          className="w-1/2 cursor-pointer"
        >
          {addStatus === "loading"
            ? "Waiting for device..."
            : credentials.length > 0
              ? "Add another passkey"
              : "Add a passkey"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function TotpSection({ userLabel }: { userLabel: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    "checking" | "not-enrolled" | "enrolling" | "verifying" | "enrolled"
  >("checking");
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setStatus("checking");
    setError(null);
    try {
      const { totpEnabled } = await getMfaStatus();
      setStatus(totpEnabled ? "enrolled" : "not-enrolled");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not check TOTP status.",
      );
      setStatus("not-enrolled");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleStart() {
    setStatus("enrolling");
    setError(null);
    try {
      const s = await startTotpEnrollment();
      setSecret(s);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start TOTP setup.",
      );
      setStatus("not-enrolled");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setError(null);
    try {
      await verifyTotpCode(code);
      setSecret(null);
      setCode("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
      setStatus("enrolling");
    }
  }

  const otpauthUri = secret
    ? `otpauth://totp/Meril:${encodeURIComponent(userLabel)}?secret=${secret}&issuer=Meril`
    : null;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!otpauthUri) {
      setQrDataUrl(null);
      return;
    }
    // generated entirely in the browser — the secret never leaves the client.
    QRCode.toDataURL(otpauthUri, { width: 180 })
      .then(setQrDataUrl)
      .catch((err) => console.error("QR generation failed:", err));
  }, [otpauthUri]);

  return (
    <div className="border-t border-border pt-4">
      <h3 className="mb-1 text-[1.2rem]  font-medium">
        Authenticator app (TOTP)
      </h3>
      <p className="mb-3 text-[1rem] text-muted-foreground">
        Add a 6-digit code from an app like Google Authenticator or Authy as an
        extra sign-in step.
      </p>

      {status === "checking" && (
        <p className="text-sm text-muted-foreground">Checking status...</p>
      )}

      {status === "enrolled" && (
        <p className="text-sm text-muted-foreground">
          Authenticator app enabled.
        </p>
      )}

      {status === "not-enrolled" && (
        <div className="flex justify-center w-full mx-auto">
          <Button
            type="button"
            onClick={handleStart}
            className="w-1/2 cursor-pointer"
          >
            Set up authenticator app
          </Button>
        </div>
      )}

      {status === "enrolling" && !secret && (
        <Button type="button" disabled className="w-full">
          Starting...
        </Button>
      )}

      {(status === "enrolling" || status === "verifying") && secret && (
        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          {qrDataUrl && (
            <img src={qrDataUrl} alt="TOTP QR code" className="mx-auto" />
          )}
          <p className="text-center text-xs text-muted-foreground">
            Or enter this code manually: <code>{secret}</code>
          </p>
          <Input
            type="text"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="h-12 text-[1.2rem] px-4"
          />
          <Button
            type="submit"
            disabled={status === "verifying"}
            className="w-full"
          >
            {status === "verifying" ? "Verifying..." : "Confirm"}
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
