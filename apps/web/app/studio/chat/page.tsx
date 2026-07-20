"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ChatPanel } from "@/components/chat-panel";

export default function PoppedOutChatPage() {
  return (
    <Suspense fallback={null}>
      <PoppedOutChat />
    </Suspense>
  );
}

function PoppedOutChat() {
  const streamId = useSearchParams().get("streamId");

  useEffect(() => {
    if (!streamId) return;

    const key = `studio-chat-open:${streamId}`;
    try {
      localStorage.setItem(key, "1");
    } catch (err) {
      console.error("Failed to set chat-open flag:", err);
    }

    const clear = () => {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.error("Failed to clear chat-open flag:", err);
      }
    };
    
    window.addEventListener("beforeunload", clear);
    window.addEventListener("pagehide", clear);

    return () => {
      clear();
      window.removeEventListener("beforeunload", clear);
      window.removeEventListener("pagehide", clear);
    };
  }, [streamId]);

  if (!streamId) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0A0B0D] text-sm text-zinc-500">
        No stream ID provided.
      </div>
    );
  }

  return (
    <div className="h-dvh bg-[#0A0B0D] text-zinc-100">
      <ChatPanel streamId={streamId} onReturn={() => window.close()} />
    </div>
  );
}
