"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/context/SessionContext";
import { FollowersSection, FollowingSection } from "./settings-followers";

export function AccountSection({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { refresh, id } = useSession();
  const [followTab, setFollowTab] = useState<"followers" | "following">(
    "followers",
  );

  async function handleLogOut() {
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      await refresh();
      onClose();
      router.push("/auth");
    }
  }

  return (
    <div className="flex flex-col gap-6 p-1">
      <DisplayNameForm />

      {id && (
        <div className="border-t border-border pt-4">
          <div className="inline-flex w-fit items-center gap-1 rounded-2xl bg-muted p-[3px]">
            <button
              type="button"
              onClick={() => setFollowTab("followers")}
              className={
                followTab === "followers"
                  ? "rounded-2xl bg-background px-3 py-1 text-sm font-medium text-foreground cursor-pointer"
                  : "rounded-2xl px-3 py-1 text-sm font-medium text-foreground/60 hover:text-foreground cursor-pointer"
              }
            >
              Followers
            </button>
            <button
              type="button"
              onClick={() => setFollowTab("following")}
              className={
                followTab === "following"
                  ? "rounded-2xl bg-background px-3 py-1 text-sm font-medium text-foreground cursor-pointer"
                  : "rounded-2xl px-3 py-1 text-sm font-medium text-foreground/60 hover:text-foreground cursor-pointer"
              }
            >
              Following
            </button>
          </div>

          <div className="pt-3">
            {followTab === "followers" ? (
              <FollowersSection userId={id} />
            ) : (
              <FollowingSection userId={id} />
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <Button
          type="button"
          variant="destructive"
          onClick={handleLogOut}
          className="cursor-pointer"
        >
          Log Out
        </Button>
      </div>
    </div>
  );
}

function DisplayNameForm() {
  const { loaded, name, email, refresh } = useSession();
  const [value, setValue] = useState(name ?? email?.split("@")[0] ?? "");
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loaded && !initialized) {
    setValue(name ?? email?.split("@")[0] ?? "");
    setInitialized(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error("Display name save failed:", err);
      setError("Could not save your display name. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3">
      <div>
        <label
          htmlFor="display-name"
          className="mb-1 block text-[1.2rem] font-medium"
        >
          Display name
        </label>
        <Input
          id="display-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={50}
          required
          className="h-12 text-[1.2rem] px-4"
        />
      </div>
      <div className="flex justify-center w-full mx-auto">
        <Button
          type="submit"
          disabled={saving || !value.trim()}
          className="w-1/2 cursor-pointer"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
