"use client";

import VideoPlayer from "@/components/video-player";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { customScrollbar } from "@/lib/scrollbar";
import { StudioCredentials } from "./studio-credentials";
import { StudioStreamData as StreamData } from "@/types/stream";

export function StudioDetailsPanel({
  state,
  stream,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  canGoLive,
  goLive,
  keyRevealed,
  onToggleKeyRevealed,
  copiedField,
  onCopy,
}: {
  state: "idle" | "creating" | "live";
  stream: StreamData | null;
  title: string;
  description: string;
  onTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDescriptionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  canGoLive: boolean | string;
  goLive: () => void;
  keyRevealed: boolean;
  onToggleKeyRevealed: () => void;
  copiedField: string | null;
  onCopy: (field: string, value: string) => void;
}) {
  const notLiveYet = state !== "live";

  return (
    <div className={`flex h-full flex-col overflow-y-auto ${customScrollbar}`}>
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
            onChange={onTitleChange}
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
            onChange={onDescriptionChange}
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
            <StudioCredentials
              stream={stream}
              keyRevealed={keyRevealed}
              onToggleKeyRevealed={onToggleKeyRevealed}
              copiedField={copiedField}
              onCopy={onCopy}
            />
          )}
        </div>
      </div>
    </div>
  );
}
