"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VideoPlayer from "@/components/video-player";
import { recordView } from "@/lib/record-view";

interface WatchItem {
  id: string;
  title: string;
  playbackUrl: string | null;
  description: string;
}

const DEFAULT_ITEM: WatchItem = {
  id: "",
  title: "Untitled",
  playbackUrl: null,
  description: "",
};

export default function WatchPage() {
  const router = useRouter();
  const [item, setItem] = useState<WatchItem>(DEFAULT_ITEM);

  useEffect(() => {
    const stored = sessionStorage.getItem("watchItem");
    if (stored) setItem(JSON.parse(stored));
  }, []);

  useEffect(() => {
    document.title = `${item.title} — Meril`;
  }, [item.title]);

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      <div className="px-8 py-6 shrink-0">
        <button
          onClick={() => router.back()}
          className="text-white/60 hover:text-white text-[1.5rem] cursor-pointer transition-colors"
        >
          ←
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-10 px-8 pb-8 lg:items-start flex-1 font-[family-name:var(--font-geist-pixel-square)] min-h-0">
        <div className="lg:w-82 shrink-0 space-y-3 pl-4">
          <h1 className="text-3xl font-semibold leading-tight">{item.title}</h1>
          <p className="text-white/40 text-[1.5rem] leading-relaxed break-words pt-10">
            {item.description}
          </p>
        </div>
        <div className="flex-1 min-h-0 pb-4">
          <div className="relative w-full h-full aspect-video">
            {item.playbackUrl && (
              <VideoPlayer
                src={item.playbackUrl}
                title={item.title}
                onFirstPlay={() => item.id && recordView(item.id)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
