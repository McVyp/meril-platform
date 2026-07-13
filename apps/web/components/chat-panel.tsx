"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ChatRoom,
  ChatMessage as IvsChatMessage,
  SendMessageRequest,
} from "amazon-ivs-chat-messaging";
import { ExternalLink, ArrowLeftFromLine, ChevronRight } from "lucide-react";
import { Textarea } from "./ui/textarea";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const IVS_CHAT_REGION =
  process.env.NEXT_PUBLIC_IVS_CHAT_REGION ?? "ap-northeast-1";

function getTempUsername() {
  if (typeof window === "undefined") return "guest";
  const key = "meril-temp-username";
  let name = sessionStorage.getItem(key);
  if (!name) {
    name = `guest-${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(key, name);
  }
  return name;
}

interface ChatMessage {
  id: string;
  username: string;
  message: string;
}

interface ChatPanelProps {
  streamId: string;
  onPopOut?: () => void;
  onReturn?: () => void;
  onCollapse?: () => void;
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 12L20 4L13 20L11 13L4 12Z" fill="currentColor" />
    </svg>
  );
}

export function ChatPanel({
  streamId,
  onPopOut,
  onReturn,
  onCollapse,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [connected, setConnected] = useState(false);
  const roomRef = useRef<ChatRoom | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const username = getTempUsername();

    const room = new ChatRoom({
      regionOrUrl: IVS_CHAT_REGION,
      tokenProvider: async () => {
        const res = await fetch(
          `${API_BASE}/api/streams/${streamId}/chat-token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          },
        );
        if (!res.ok) throw new Error("Failed to fetch chat token");
        const data = await res.json();
        return {
          token: data.token,
          sessionExpirationTime: new Date(data.sessionExpirationTime),
          tokenExpirationTime: new Date(data.tokenExpirationTime),
        };
      },
    });

    roomRef.current = room;

    room.addListener("connect", () => setConnected(true));
    room.addListener("disconnect", () => setConnected(false));
    room.addListener("message", (message: IvsChatMessage) => {
      setMessages((prev) => [
        ...prev,
        {
          id: message.id,
          username: (message.sender?.userId as string) ?? "unknown",
          message: message.content,
        },
      ]);
    });

    room.connect();

    return () => {
      room.disconnect();
      roomRef.current = null;
    };
  }, [streamId]);

  const sendChat = useCallback(() => {
    if (!chatInput.trim() || !roomRef.current) return;
    const request = new SendMessageRequest(chatInput);
    roomRef.current.sendMessage(request).catch((err) => {
      console.error("Failed to send chat message:", err);
    });
    setChatInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [chatInput]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    const el = e.target;
    const style = getComputedStyle(el);
    const borderY =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + borderY, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 p-4">
        <div className="flex items-center gap-2">
          <span className="text-[1.5rem] font-medium text-zinc-300">Chat</span>
          {!connected && (
            <span className="text-[1.2rem] text-zinc-600">connecting…</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="rounded-md p-2 text-zinc-500 hover:text-zinc-200 cursor-pointer shadow-lg border border-zinc-700 hover:border-zinc-600"
              title="Hide chat"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          {onPopOut && (
            <button
              onClick={onPopOut}
              className="rounded-md p-2 text-zinc-500 hover:text-zinc-200 cursor-pointer shadow-lg border border-zinc-700 hover:border-zinc-600"
              title="Pop out chat"
            >
              <ExternalLink className="h-6 w-6" />
            </button>
          )}
          {onReturn && (
            <button
              onClick={onReturn}
              className="rounded p-2 text-zinc-500 hover:text-zinc-200 cursor-pointer border-none hover:border-zinc-700 rounded-md shadow-lg"
              title="Return to studio"
            >
              <ArrowLeftFromLine className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => (
          <div key={m.id} className="text-sm leading-snug">
            <span className="font-medium text-emerald-400">{m.username}</span>
            <span className="text-zinc-500">: </span>
            <span className="text-zinc-300">{m.message}</span>
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-zinc-800 p-3">
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={chatInput}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Send a message"
            disabled={!connected}
            rows={1}
            className="max-h-[120px] min-h-9 w-full resize-none overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-3 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {chatInput.trim() && (
            <button
              onClick={sendChat}
              disabled={!connected}
              className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
              title="Send"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
