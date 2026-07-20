"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat-panel";

export function StudioChatPanel({
  notLiveYet,
  isChatPoppedOut,
  streamId,
  onPopOut,
  bringChatBack,
}: {
  notLiveYet: boolean;
  isChatPoppedOut: boolean;
  streamId: string | null;
  onPopOut: () => void;
  bringChatBack: () => void;
}) {
  return (
    <div className="h-full border-l border-zinc-800">
      {notLiveYet ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-600">
          Chat opens once you&apos;re live.
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
        streamId && <ChatPanel streamId={streamId} onPopOut={onPopOut} />
      )}
    </div>
  );
}
