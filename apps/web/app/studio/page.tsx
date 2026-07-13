"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ChatPanel } from "@/components/chat-panel";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Users,
  Square,
} from "lucide-react";
import VideoPlayer from "@/components/video-player";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { customScrollbar } from "@/lib/scrollbar";
import { useChatPopout } from "@/hooks/useChatPopout";

const TEMP_USER_ID = "user_temp_001";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DRAFT_KEY = "studio-draft";

type StudioState = "idle" | "creating" | "live";
type SaveStatus = "idle" | "saving" | "saved";

interface StreamData {
  id: string;
  playbackUrl: string;
  ingestEndpoint: string;
  streamKey: string;
}

function loadDraft(): { title: string; description: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(title: string, description: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description }));
  } catch {}
}

function clearDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DRAFT_KEY);
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
    fetch(`${API_BASE}/api/streams/mine?userId=${TEMP_USER_ID}`)
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
      .catch(() => {})
      .finally(() => setRehydrating(false));
  }, []);

  const handleWsMessage = useCallback((data: any) => {
    switch (data.type) {
      case "VIEWER_COUNT":
        setViewerCount(data.count);
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
          const res = await fetch(`${API_BASE}/api/streams/${stream.id}`, {
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
        } catch {
          setSaveStatus("idle");
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
      const res = await fetch(`${API_BASE}/api/streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: finalDescription,
          userId: TEMP_USER_ID,
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
      const res = await fetch(`${API_BASE}/api/streams/${stream.id}/end`, {
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
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  const notLiveYet = state !== "live";
  const canGoLive = title.trim() && state === "idle";

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

      {error && (
        <p className="border-b border-zinc-800 bg-red-500/5 px-4 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize="50%" minSize="30%">
          <div
            className={`flex h-full flex-col overflow-y-auto ${customScrollbar}`}
          >
            <div className="flex aspect-video w-full items-center justify-center bg-black">
              {state === "live" && stream ? (
                <VideoPlayer
                  src={stream.playbackUrl}
                  isLive
                  showLiveBadge={false}
                  title={title}
                />
              ) : state === "creating" ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Spinning up channel…
                  </p>
                </div>
              ) : (
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-700">
                  Not live yet
                </p>
              )}
            </div>

            <div className="border-b border-zinc-800 p-6 space-y-4">
              <div>
                <FieldLabel
                  htmlFor="stream-title"
                  className="mb-2 font-mono text-xs tracking-[0.2em] text-zinc-500  text-[1.2rem]"
                >
                  Title
                </FieldLabel>
                <Input
                  id="stream-title"
                  value={title}
                  onChange={handleTitleChange}
                  onKeyDown={(e) => e.key === "Enter" && canGoLive && goLive()}
                  placeholder="Stream title"
                  disabled={state === "creating"}
                  className="focus-visible:ring-0 focus-visible:ring-offset-0 border-zinc-800 p-4 rounded-sm"
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor="stream-description"
                  className="mb-2 font-mono text-xs tracking-[0.2em] text-[1.2rem] text-zinc-500"
                >
                  Description
                </FieldLabel>
                <Textarea
                  id="stream-description"
                  value={description}
                  onChange={handleDescriptionChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && canGoLive) {
                      e.preventDefault();
                      goLive();
                    }
                  }}
                  placeholder="What's this stream about? (optional — defaults to the title)"
                  rows={5}
                  disabled={state === "creating"}
                  className="focus-visible:ring-0 focus-visible:ring-offset-0 border-zinc-800 p-4 rounded-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
              <div>
                <p className="mb-3 font-mono text-xs tracking-[0.2em] text-[1.5rem] text-zinc-500">
                  Credentials
                </p>
                {notLiveYet ? (
                  <p className="rounded-md border border-dashed border-zinc-800 p-3 text-sm text-zinc-600">
                    Credentials appear once you go live.
                  </p>
                ) : (
                  <FieldGroup className="min-w-0">
                    <Field className="min-w-0 w-full">
                      <FieldLabel>Ingest URL</FieldLabel>
                      <div className="relative min-w-0 w-full">
                        <div className="min-w-0 w-full break-all rounded-md border border-zinc-800 bg-zinc-900/50 py-2 pl-3 pr-9 font-mono text-sm text-zinc-200">
                          {stream?.ingestEndpoint || "—"}
                        </div>
                        <button
                          onClick={() =>
                            copyField("ingest", stream?.ingestEndpoint ?? "")
                          }
                          className="absolute right-1.5 top-1.5 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          {copiedField === "ingest" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </Field>

                    <Field className="min-w-0 w-full">
                      <FieldLabel>Stream key</FieldLabel>
                      <div className="relative min-w-0 w-full">
                        <div className="min-w-0 w-full break-all rounded-md border border-zinc-800 bg-zinc-900/50 py-2 pl-3 pr-16 font-mono text-sm text-zinc-200">
                          {keyRevealed
                            ? stream?.streamKey || "—"
                            : "•".repeat(
                                Math.min(stream?.streamKey?.length ?? 0, 32),
                              )}
                        </div>
                        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                          <button
                            onClick={() => setKeyRevealed((v) => !v)}
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          >
                            {keyRevealed ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              copyField("key", stream?.streamKey ?? "")
                            }
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          >
                            {copiedField === "key" ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </Field>

                    <Field className="min-w-0 w-full">
                      <FieldLabel>Playback URL</FieldLabel>
                      <div className="relative min-w-0 w-full">
                        <div className="min-w-0 w-full break-all rounded-md border border-zinc-800 bg-zinc-900/50 py-2 pl-3 pr-9 font-mono text-sm text-zinc-200">
                          {stream?.playbackUrl || "—"}
                        </div>
                        <button
                          onClick={() =>
                            copyField("playback", stream?.playbackUrl ?? "")
                          }
                          className="absolute right-1.5 top-1.5 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          {copiedField === "playback" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </Field>
                  </FieldGroup>
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle className="bg-zinc-800" />

        <ResizablePanel defaultSize="50%" minSize="30%">
          <div className="h-full border-l border-zinc-800">
            {notLiveYet ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-600">
                Chat opens once you're live.
              </div>
            ) : isChatPoppedOut ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <ExternalLink className="h-5 w-5 text-zinc-600" />
                <p className="text-sm text-zinc-500">
                  Chat is open in a separate window.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bringChatBack}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Bring back
                </Button>
              </div>
            ) : (
              stream && <ChatPanel streamId={stream.id} onPopOut={popOutChat} />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
