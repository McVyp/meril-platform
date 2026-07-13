"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import VideoPlayer from "@/components/video-player";
import { ChatPanel } from "@/components/chat-panel";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ChevronLeft } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const CHAT_COLLAPSED_KEY = "live-chat-collapsed";

interface Stream {
  id: string;
  title: string;
  status: string;
  playbackUrl: string | null;
  viewerCount: number;
  userId: string;
}

export default function LivePage() {
  const params = useParams();
  const id = params.id as string;
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [stream, setStream] = useState<Stream | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);

  const [chatCollapsed, setChatCollapsed] = useState(false);
  useEffect(() => {
    setChatCollapsed(localStorage.getItem(CHAT_COLLAPSED_KEY) === "1");
  }, []);
  const toggleChat = useCallback(() => {
    setChatCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(CHAT_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/streams/${id}`)
      .then((r) => r.json())
      .then((data: Stream) => {
        setStream(data);
        setViewerCount(data.viewerCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleWsMessage = useCallback((data: any) => {
    if (data.type === "VIEWER_COUNT") setViewerCount(data.count);
  }, []);
  useWebSocket(id, handleWsMessage);

  if (loading) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center text-white/40 text-[1.4rem]">
        Stream not found.
      </div>
    );
  }

  const isLive = stream.status === "LIVE";

  return (
    <div className="h-dvh bg-black flex flex-col lg:flex-row lg:overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="relative w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0">
          {isLive && stream.playbackUrl ? (
            <VideoPlayer src={stream.playbackUrl} title={stream.title} isLive />
          ) : isLive ? (
            <div className="absolute inset-0 flex items-center justify-center text-white/20 text-[1.4rem]">
              Waiting for stream…
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
              <div className="text-white/60 text-[1.4rem] font-medium">
                {stream.title}
              </div>
              <div className="text-white/30 text-[1.2rem]">
                This stream is not live right now.
              </div>
            </div>
          )}

          {isLive && (
            <div className="lg:hidden absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-[1.1rem] font-bold px-2 py-1 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </div>
          )}

          <div className="lg:hidden absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black to-transparent" />
        </div>

        <div className="px-4 py-3 bg-black lg:bg-[#0e0e10] border-b lg:border-b-0 lg:border-t border-white/10 relative z-20 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.5rem] lg:text-[1.6rem] font-semibold text-white truncate">
                {stream.title}
              </h1>
              {isLive && (
                <div className="lg:hidden flex items-center gap-1.5 text-[1.2rem] text-red-400 font-medium mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Live
                </div>
              )}
            </div>
            <span className="text-white/50 text-[1.2rem] shrink-0">
              <span className="text-white/80 font-medium">
                {viewerCount.toLocaleString()}
              </span>{" "}
              watching
            </span>
          </div>
        </div>
      </div>

      {!isDesktop && (
        <div className="relative z-20 bg-[#0e0e10] flex flex-col flex-1 min-h-0">
          <ChatPanel streamId={id} />
        </div>
      )}

      {isDesktop && !chatCollapsed && (
        <div className="shrink-0" style={{ width: 340 }}>
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizableHandle className="bg-white/10" />
            <ResizablePanel defaultSize={100} minSize={20}>
              <ChatPanel streamId={id} onCollapse={toggleChat} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
      {isDesktop && chatCollapsed && (
        <button
          onClick={toggleChat}
          className="hidden lg:flex fixed top-3 right-2 z-30 items-center justify-center py-4 px-2 h-10 bg-zinc-800/90 text-white/70 shadow-lg backdrop-blur hover:bg-zinc-700 hover:text-white transition-colors cursor-pointer rounded-md"
          title="Show chat"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
