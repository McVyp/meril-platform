"use client";
import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  startSignIn,
  signInWithPassword,
  respondToMfaCode,
} from "@/lib/auth/cognito-client";
import { completeLogin } from "@/lib/auth/complete-login";
import { useSession } from "@/context/SessionContext";

function LoginFieldsComponent({
  email,
  onEmailChange,
  onLoadingChange,
  returnTo,
  onForgotPassword,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onLoadingChange: (loading: boolean) => void;
  returnTo: string;
  onForgotPassword: () => void;
}) {
  const router = useRouter();
  const { refresh } = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [mfaSession, setMfaSession] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    onLoadingChange(true);
    try {
      const started = await startSignIn(email);
      if (!started.session) {
        throw new Error("Could not start sign-in. Check the email address.");
      }
      const result = await signInWithPassword(email, password, started.session);

      if (result.tokens?.idToken) {
        await completeLogin(result.tokens);
        await refresh();
        router.push(returnTo);
        return;
      }

      if (
        result.availableChallenges?.includes("SOFTWARE_TOKEN_MFA") &&
        result.session
      ) {
        setMfaSession(result.session);
        return;
      }

      setError("Sign-in did not complete. Unexpected response from Cognito.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPassword("");
    } finally {
      onLoadingChange(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaSession) return;
    setError(null);
    onLoadingChange(true);
    try {
      const result = await respondToMfaCode(email, mfaCode, mfaSession);
      if (result.tokens?.idToken) {
        await completeLogin(result.tokens);
        await refresh();
        router.push(returnTo);
        return;
      }
      setError("Code did not complete sign-in. Unexpected response.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid code — check your authenticator app and try again.",
      );
    } finally {
      onLoadingChange(false);
    }
  }

  if (mfaSession) {
    return (
      <form id="login-form" onSubmit={handleMfaSubmit}>
        <div className="flex h-full flex-col gap-6 mt-4">
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app.
          </p>
          <div className="grid grid-cols-[110px_1fr] items-center gap-2">
            <Label htmlFor="login-mfa-code" className="text-[1.2rem]">
              Code
            </Label>
            <Input
              id="login-mfa-code"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="button"
            className="text-left text-sm text-muted-foreground underline cursor-pointer"
            onClick={() => {
              setMfaSession(null);
              setMfaCode("");
              setPassword("");
              setError(null);
            }}
          >
            Back to password
          </button>
        </div>
      </form>
    );
  }

  return (
    <form id="login-form" onSubmit={handleSubmit}>
      <div className="flex h-full flex-col gap-6 mt-4">
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <Label htmlFor="login-email" className="text-[1.2rem]">
            Email
          </Label>
          <Input
            id="login-email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <Label htmlFor="login-password" className="text-[1.2rem]">
            Password
          </Label>
          <Input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="button"
          className="text-left text-sm text-muted-foreground underline cursor-pointer"
          onClick={onForgotPassword}
        >
          Forgot password?
        </button>
      </div>
    </form>
  );
}

export const LoginFields = memo(LoginFieldsComponent);
