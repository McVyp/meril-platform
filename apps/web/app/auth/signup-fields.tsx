"use client";
import { memo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signUp,
  confirmSignUp,
  resendConfirmationCode,
} from "@/lib/auth/cognito-client";

function SignUpFieldsComponent({
  onLoadingChange,
}: {
  onLoadingChange: (loading: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    onLoadingChange(true);
    try {
      await signUp(email, password);
      setStep("confirm");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
      setPassword("");
      setConfirmPassword("");
    } finally {
      onLoadingChange(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    onLoadingChange(true);
    try {
      await confirmSignUp(email, code);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed.");
    } finally {
      onLoadingChange(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);
    try {
      await resendConfirmationCode(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setResending(false);
    }
  }

  if (step === "confirm") {
    return (
      <form id="signup-form" onSubmit={handleConfirm}>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            We sent a confirmation code to {email}.
          </p>
          <div className="grid grid-cols-[110px_1fr] items-center gap-2">
            <Label htmlFor="confirm-code">Confirmation code</Label>
            <Input
              id="confirm-code"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-center">
            <button
              type="submit"
              className="w-1/2 cursor-pointer rounded-sm border border-border bg-white py-2 text-sm font-medium text-black"
            >
              Confirm
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

  if (step === "done") {
    return (
      <p className="text-sm text-muted-foreground">
        Your account is confirmed — switch to the Log In tab to sign in.
      </p>
    );
  }

  return (
    <form id="signup-form" onSubmit={handleSignUp}>
      <div className="flex flex-col gap-6 mt-4">
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <Label htmlFor="signup-email" className="text-[1.2rem]">
            Email
          </Label>
          <Input
            id="signup-email"
            type="email"
            placeholder="m@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <Label htmlFor="signup-password" className="text-[1.2rem]">
            Password
          </Label>
          <Input
            id="signup-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <Label htmlFor="signup-confirm-password" className="text-[1.2rem]">
            Confirm password
          </Label>
          <Input
            id="signup-confirm-password"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="border-0 border-b border-zinc-700 rounded-none bg-zinc-900 p-4 text-[1.4rem] focus-visible:border-b-foreground focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}

export const SignUpFields = memo(SignUpFieldsComponent);
