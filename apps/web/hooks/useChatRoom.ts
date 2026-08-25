"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatRoom,
  SendMessageRequest,
  ChatMessage as IvsChatMessage,
} from "amazon-ivs-chat-messaging";

const IVS_CHAT_REGION =
  process.env.NEXT_PUBLIC_IVS_CHAT_REGION ?? "ap-northeast-1";

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
}

export function useChatRoom(streamId: string, maxMessages: number) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const roomRef = useRef<ChatRoom | null>(null);

  useEffect(() => {
    let cancelled = false;

    const room = new ChatRoom({
      regionOrUrl: IVS_CHAT_REGION,
      tokenProvider: async () => {
        const res = await fetch(`/api/streams/${streamId}/chat-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) setConnectError(true);
          throw new Error("Failed to fetch chat token");
        }
        const data = await res.json();
        if (!cancelled) setCanSend(data.canSend);
        return {
          token: data.token,
          sessionExpirationTime: new Date(data.sessionExpirationTime),
          tokenExpirationTime: new Date(data.tokenExpirationTime),
        };
      },
    });
    roomRef.current = room;
    room.addListener("connect", () => {
      setConnected(true);
      setConnectError(false);
    });
    room.addListener("disconnect", () => setConnected(false));
    room.addListener("message", (message: IvsChatMessage) => {
      setMessages((prev) => [
        ...prev.slice(-(maxMessages - 1)),
        {
          id: message.id,
          username:
            (message.sender?.attributes?.displayName as string) ??
            (message.sender?.attributes?.username as string) ??
            "Guest",
          message: message.content,
        },
      ]);
    });
    room.connect();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
  }, [streamId, maxMessages]);

  const sendChat = useCallback(
    (text: string) => {
      if (!text.trim() || !roomRef.current || !canSend) return false;
      roomRef.current.sendMessage(new SendMessageRequest(text)).catch((err) => {
        console.error("Failed to send chat message:", err);
      });
      return true;
    },
    [canSend],
  );
  return { messages, connected, connectError, canSend, sendChat };
}
