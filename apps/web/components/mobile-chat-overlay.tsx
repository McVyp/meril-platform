"use client";
import { useChatRoom } from "@/hooks/useChatRoom";

export function MobileChatOverlay({ streamId }: { streamId: string }) {
  const { messages } = useChatRoom(streamId, 50);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[45%] flex-col justify-end bg-gradient-to-t from-black/60 to-transparent p-6">
      <div className="noscrollbar space-y-1.5 overflow-y-auto pb-2 [mask-image:linear-gradient(to_bottom,transparent,black_15%)]">
        {messages.map((m) => (
          <p key={m.id} className="text-sm leading-snug drop-shadow">
            <span className="font-semibold text-zinc-200">{m.username}</span>{" "}
            <span className="text-zinc-100">{m.message}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
