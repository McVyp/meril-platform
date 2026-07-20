"use client";

import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { StreamCredentials } from "@/types/stream";

export function StudioCredentials({
  stream,
  keyRevealed,
  onToggleKeyRevealed,
  copiedField,
  onCopy,
}: {
  stream: StreamCredentials | null;
  keyRevealed: boolean;
  onToggleKeyRevealed: () => void;
  copiedField: string | null;
  onCopy: (field: string, value: string) => void;
}) {
  return (
    <FieldGroup className="min-w-0">
      <Field className="min-w-0 w-full">
        <FieldLabel>Ingest URL</FieldLabel>
        <div className="relative min-w-0 w-full">
          <div className="min-w-0 w-full break-all rounded-md border border-zinc-800 bg-zinc-900/50 py-2 pl-3 pr-9 font-mono text-sm text-zinc-200">
            {stream?.ingestEndpoint || "—"}
          </div>
          <button
            onClick={() => onCopy("ingest", stream?.ingestEndpoint ?? "")}
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
              : "•".repeat(Math.min(stream?.streamKey?.length ?? 0, 32))}
          </div>
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
            <button
              onClick={onToggleKeyRevealed}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              {keyRevealed ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => onCopy("key", stream?.streamKey ?? "")}
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
            onClick={() => onCopy("playback", stream?.playbackUrl ?? "")}
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
  );
}
