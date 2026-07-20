"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WsMessage } from "@/types/stream";

interface StreamState {
  streamId: string | null;
  status: "OFFLINE" | "LIVE" | "ENDED";
  viewerCount: number;
  playbackUrl: string | null;
}

interface StreamContextValue extends StreamState {
  joinStream: (streamId: string, playbackUrl: string) => void;
  leaveStream: () => void;
  sendChat: (message: string, username: string) => void;
}

const StreamContext = createContext<StreamContextValue | null>(null);

export function StreamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StreamState>({
    streamId: null,
    status: "OFFLINE",
    viewerCount: 0,
    playbackUrl: null,
  });

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as WsMessage;

    if (msg.type === "VIEWER_COUNT") {
      setState((prev) => ({ ...prev, viewerCount: msg.count ?? 0 }));
    } else if (msg.type === "STREAM_LIVE") {
      setState((prev) => ({
        ...prev,
        status: "LIVE",
        playbackUrl: msg.playbackUrl ?? prev.playbackUrl,
      }));
    } else if (msg.type === "STREAM_ENDED") {
      setState((prev) => ({ ...prev, status: "ENDED" }));
    }
  }, []);

  const { send } = useWebSocket(state.streamId, handleMessage);

  const joinStream = useCallback((streamId: string, playbackUrl: string) => {
    setState((prev) => ({ ...prev, streamId, playbackUrl, status: "LIVE" }));
  }, []);

  const leaveStream = useCallback(() => {
    setState({
      streamId: null,
      status: "OFFLINE",
      viewerCount: 0,
      playbackUrl: null,
    });
  }, []);

  const sendChat = useCallback(
    (message: string, username: string) => {
      send({ type: "CHAT", message, username });
    },
    [send],
  );

  return (
    <StreamContext.Provider
      value={{ ...state, joinStream, leaveStream, sendChat }}
    >
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useStream must be used within StreamProvider");
  return ctx;
}
