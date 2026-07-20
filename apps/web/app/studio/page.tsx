"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Users, Square } from "lucide-react";
import { useChatPopout } from "@/hooks/useChatPopout";

import { StudioChatPanel } from "./studio-chat-panel";
import { StudioDetailsPanel } from "./studio-details-panel";
import { WsMessage, StudioStreamData as StreamData } from "@/types/stream";

const DRAFT_KEY = "studio-draft";

type StudioState = "idle" | "creating" | "live";
type SaveStatus = "idle" | "saving" | "saved" | "error";

function loadDraft(): { title: string; description: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to load draft:", err);
    return null;
  }
}

function saveDraft(title: string, description: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description }));
  } catch (err) {
    console.error("Failed to save draft:", err);
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    console.error("Failed to clear draft:", err);
  }
}

export default function StudioPage() {
  const [state, setState] = useState<StudioState>("idle");
  const [stream, setStream] = useState<StreamData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [rehydrating, setRehydrating] = useState(true);
  const [rehydrateError, setRehydrateError] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState(() => loadDraft()?.title ?? "");
  const [description, setDescription] = useState(
    () => loadDraft()?.description ?? "",
  );
  const {
    isOpen: isChatPoppedOut,
    open: popOutChat,
    bringBack: bringChatBack,
  } = useChatPopout(stream?.id ?? null);

  useEffect(() => {
    fetch("/api/streams/mine")
      .then((r) => r.json())
      .then((data) => {
        if (data.stream) {
          setStream({
            id: data.stream.id,
            playbackUrl: data.stream.playbackUrl,
            ingestEndpoint: data.stream.ingestEndpoint,
            streamKey: data.stream.streamKey,
          });
          setTitle(data.stream.title ?? "");
          setDescription(data.stream.description ?? "");
          setState("live");
        }
      })
      .catch((err) => {
        console.error("Failed to load current stream:", err);
        setRehydrateError(true);
      })
      .finally(() => setRehydrating(false));
  }, []);

  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as WsMessage;
    switch (msg.type) {
      case "VIEWER_COUNT":
        setViewerCount(msg.count ?? 0);
        break;
      case "STREAM_ENDED":
        setState("idle");
        setStream(null);
        break;
    }
  }, []);

  useWebSocket(stream?.id ?? null, handleWsMessage);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const persistDetails = useCallback(
    (nextTitle: string, nextDescription: string) => {
      if (!stream) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveStatus("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/streams/${stream.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: nextTitle,
              description: nextDescription,
            }),
          });
          if (!res.ok) throw new Error("Failed to save");
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 1500);
        } catch (err) {
          console.error("Failed to save stream details:", err);
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 2500);
        }
      }, 800);
    },
    [stream],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    if (state === "live") {
      persistDetails(value, description);
    } else {
      saveDraft(value, description);
    }
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const value = e.target.value;
    setDescription(value);
    if (state === "live") {
      persistDetails(title, value);
    } else {
      saveDraft(title, value);
    }
  };

  const goLive = useCallback(async () => {
    if (!title.trim()) return;
    const finalDescription = description.trim() || title.trim();
    setError(null);
    setState("creating");
    try {
      const res = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: finalDescription,
        }),
      });
      if (!res.ok) throw new Error("Failed to create stream");
      const data = await res.json();
      setStream({
        id: data.stream.id,
        playbackUrl: data.stream.playbackUrl,
        ingestEndpoint: data.ingestEndpoint,
        streamKey: data.streamKey,
      });
      setDescription(finalDescription);
      setState("live");
      clearDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
    }
  }, [title, description]);

  const endStream = useCallback(async () => {
    if (!stream) return;
    try {
      const res = await fetch(`/api/streams/${stream.id}/end`, {
        method: "PUT",
      });
      if (!res.ok) throw new Error("Failed to end stream");
      bringChatBack();
      setState("idle");
      setStream(null);
      setTitle("");
      setDescription("");
      setViewerCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end stream");
    }
  }, [stream, bringChatBack]);

  const copyField = useCallback((field: string, value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 1500);
      })
      .catch((err) => {
        console.error("Copy to clipboard failed:", err);
      });
  }, []);

  const notLiveYet = state !== "live";
  const canGoLive = !!title.trim() && state === "idle";

  if (rehydrating) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0A0B0D]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[#0A0B0D] text-zinc-100">
      <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-800 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`shrink-0 font-mono text-[11px] uppercase tracking-[0.15em] ${
              state === "live" ? "text-red-500" : "text-zinc-600"
            }`}
          >
            {state === "live" ? "LIVE" : "OFFLINE"}
          </span>

          {saveStatus === "saving" && (
            <span className="shrink-0 font-mono text-[11px] text-zinc-600">
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="shrink-0 font-mono text-[11px] text-emerald-500">
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="shrink-0 font-mono text-[11px] text-red-500">
              Save failed
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {state === "live" && (
            <div className="flex items-center gap-1.5 font-mono text-sm text-zinc-400">
              <Users className="h-3.5 w-3.5" />
              {viewerCount}
            </div>
          )}
          <Button
            onClick={state === "live" ? endStream : goLive}
            disabled={state === "idle" ? !canGoLive : false}
            variant={state === "live" ? "outline" : "default"}
            size="sm"
            className={`text-[1.2rem] p-4 cursor-pointer ${
              state === "live"
                ? "gap-1.5 border-zinc-700 text-zinc-300 hover:bg-red-500/10 hover:text-red-600"
                : "bg-red-800 text-white hover:bg-red-600 disabled:opacity-40 cursor-pointer"
            }`}
          >
            {state === "live" && <Square className="h-3 w-3" />}
            {state === "live"
              ? "End stream"
              : state === "creating"
                ? "Starting…"
                : "Go Live"}
          </Button>
        </div>
      </div>

      {(error || rehydrateError) && (
        <p className="border-b border-zinc-800 bg-red-500/5 px-4 py-2 text-sm text-red-400">
          {error ?? "Couldn't load your current stream — try refreshing."}
        </p>
      )}

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize="50%" minSize="30%">
          <StudioDetailsPanel
            state={state}
            stream={stream}
            title={title}
            description={description}
            onTitleChange={handleTitleChange}
            onDescriptionChange={handleDescriptionChange}
            canGoLive={canGoLive}
            goLive={goLive}
            keyRevealed={keyRevealed}
            onToggleKeyRevealed={() => setKeyRevealed((v) => !v)}
            copiedField={copiedField}
            onCopy={copyField}
          />
        </ResizablePanel>

        <ResizableHandle className="bg-zinc-800" />

        <ResizablePanel defaultSize="50%" minSize="30%">
          <StudioChatPanel
            notLiveYet={notLiveYet}
            isChatPoppedOut={isChatPoppedOut}
            streamId={stream?.id ?? null}
            onPopOut={popOutChat}
            bringChatBack={bringChatBack}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
