"use client";
import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signInWithPasskey } from "@/lib/auth/cognito-passkey";
import { startSignIn } from "@/lib/auth/cognito-client";
import { completeLogin } from "@/lib/auth/complete-login";
import { SignUpFields } from "./signup-fields";
import { LoginFields } from "./login-fields";
import { ForgotPasswordFields } from "./forgot-password-fields";
import { customScrollbar } from "@/lib/scrollbar";
import { useSession } from "@/context/SessionContext";

const TITLES: Record<
  "login" | "signup" | "forgot",
  { title: string; description: string }
> = {
  login: {
    title: "Log in to your account",
    description: "Enter your email and password below.",
  },
  signup: {
    title: "Create an account",
    description: "Enter your email and choose a password.",
  },
  forgot: {
    title: "Reset your password",
    description: "We'll email you a code to set a new password.",
  },
};

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const router = useRouter();
  const { refresh } = useSession();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo");
  // only allow same-origin relative paths — prevents an open-redirect if
  // someone crafts a link like /auth?returnTo=https://evil.com
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith("/") ? rawReturnTo : "/";

  const [tab, setTab] = useState<"login" | "signup" | "forgot">("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const formId = tab === "login" ? "login-form" : "signup-form";

  const handleForgotPassword = useCallback(() => setTab("forgot"), []);
  const handleBackToLogin = useCallback(() => setTab("login"), []);

  async function handlePasskeySignIn() {
    setPasskeyError(null);
    setLoading(true);
    try {
      const started = await startSignIn(email);
      if (!started.session) {
        throw new Error("Could not start sign-in. Check the email address.");
      }
      if (!started.availableChallenges?.includes("WEB_AUTHN")) {
        throw new Error("No passkey is registered for this account yet.");
      }
      const result = await signInWithPasskey(email, started.session);

      if (result.tokens?.idToken) {
        await completeLogin(result.tokens);
        await refresh();
        router.push(returnTo);
        return;
      }
      setPasskeyError("Passkey sign-in did not complete.");
    } catch (err) {
      console.error("Passkey sign-in failed:", err);
      setPasskeyError(
        err instanceof Error ? err.message : "Passkey sign-in failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full md:w-[400px]">
        <CardHeader>
          <CardTitle className="text-[1.4rem]">{TITLES[tab].title}</CardTitle>
          <CardDescription className="text-[1.2rem]">
            {TITLES[tab].description}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {tab !== "forgot" && (
            <div className="mb-4 flex">
              <button
                type="button"
                onClick={() => setTab("login")}
                className={`flex-1 cursor-pointer border-b py-2 text-[1.4rem] font-medium transition-colors ${
                  tab === "login"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => setTab("signup")}
                className={`flex-1 cursor-pointer border-b py-2 text-[1.4rem] font-medium transition-colors ${
                  tab === "signup"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          <div className={`mb-4 h-[12rem] overflow-y-auto ${customScrollbar}`}>
            {tab === "login" ? (
              <LoginFields
                email={email}
                onEmailChange={setEmail}
                onLoadingChange={setLoading}
                returnTo={returnTo}
                onForgotPassword={handleForgotPassword}
              />
            ) : tab === "signup" ? (
              <SignUpFields onLoadingChange={setLoading} />
            ) : (
              <ForgotPasswordFields
                onLoadingChange={setLoading}
                onBackToLogin={handleBackToLogin}
              />
            )}
          </div>

          {tab === "login" && passkeyError && (
            <p className="mb-2 text-sm text-destructive">{passkeyError}</p>
          )}
        </CardContent>

        {tab !== "forgot" && (
          <div className="mx-auto flex w-full items-center justify-center gap-3 px-6 pb-6">
            <Button
              type="submit"
              form={formId}
              disabled={loading}
              className="w-1/2 !border-1 rounded-sm border-border py-6 text-[1.4rem] cursor-pointer"
            >
              {loading
                ? tab === "login"
                  ? "Logging in..."
                  : "Creating account..."
                : tab === "login"
                  ? "Log In"
                  : "Sign Up"}
            </Button>

            {tab === "login" && (
              <button
                type="button"
                onClick={handlePasskeySignIn}
                disabled={loading || !email}
                title={
                  !email ? "Enter your email first" : "Sign in with a passkey"
                }
                className="w-1/2 !border-1 rounded-sm border-border py-2 text-[1.4rem] cursor-pointer"
              >
                Use passkey
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
