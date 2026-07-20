"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  forgotPassword,
  confirmForgotPassword,
} from "@/lib/auth/cognito-client";

export function ForgotPasswordFields({
  onLoadingChange,
  onBackToLogin,
}: {
  onLoadingChange: (loading: boolean) => void;
  onBackToLogin: () => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    onLoadingChange(true);
    try {
      await forgotPassword(email);
      setStep("confirm");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send reset code.",
      );
    } finally {
      onLoadingChange(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmNewPassword) {
      setError("Passwords don't match.");
      return;
    }

    onLoadingChange(true);
    try {
      await confirmForgotPassword(email, code, newPassword);
      setStep("done");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset password.",
      );
    } finally {
      onLoadingChange(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);
    try {
      await forgotPassword(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setResending(false);
    }
  }

  if (step === "done") {
    return (
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Your password has been reset — switch to the Log In tab to sign in.
        </p>
        <button
          type="button"
          className="text-left text-sm text-muted-foreground underline cursor-pointer"
          onClick={onBackToLogin}
        >
          Back to log in
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <form onSubmit={handleConfirm}>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            We sent a reset code to {email}.
          </p>
          <div className="grid grid-cols-[110px_1fr] items-center gap-2">
            <Label htmlFor="forgot-code">Reset code</Label>
            <Input
              id="forgot-code"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
          <div className="grid grid-cols-[110px_1fr] items-center gap-2">
            <Label htmlFor="forgot-new-password">New password</Label>
            <Input
              id="forgot-new-password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
          <div className="grid grid-cols-[110px_1fr] items-center gap-2">
            <Label htmlFor="forgot-confirm-new-password">
              Confirm password
            </Label>
            <Input
              id="forgot-confirm-new-password"
              type="password"
              required
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-center">
            <button
              type="submit"
              className="w-1/2 cursor-pointer rounded-sm border border-border bg-white py-2 text-sm font-medium text-black"
            >
              Reset password
            </button>
          </div>
          <button
            type="button"
            disabled={resending}
            className="text-sm text-muted-foreground underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleResend}
          >
            {resending ? "Resending..." : "Resend code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest}>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a code to reset your
          password.
        </p>
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-center">
          <button
            type="submit"
            className="w-1/2 cursor-pointer rounded-sm border border-border bg-white py-2 text-sm font-medium text-black"
          >
            Send reset code
          </button>
        </div>
        <button
          type="button"
          className="text-left text-sm text-muted-foreground underline cursor-pointer"
          onClick={onBackToLogin}
        >
          Back to log in
        </button>
      </div>
    </form>
  );
}
