"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Title from "@/components/title";
import Video from "@/components/video";
import { videoData } from "@/data/videos";
import { ApiVideo, VideoData } from "@/types/video";
import { Clapperboard, TriangleAlert } from "lucide-react";
import { useVideoCache } from "@/hooks/useVideoCache";
import "./globals.css";

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<VideoData[]>(videoData);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [failedVideos, setFailedVideos] = useState<Set<number>>(new Set());
  const currentIdRef = useRef<string | number | null>(videoData[0]?.id ?? null);

  const wheelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const lastTouchTime = useRef(0);
  const touchMoved = useRef(false);

  const nextItem = items[(currentIndex + 1) % items.length];
  const prevItem = items[(currentIndex - 1 + items.length) % items.length];

  const currentItem = items[currentIndex];
  const currentFailed = failedVideos.has(currentIndex);

  const urlsToCache = useMemo(
    () =>
      [currentItem?.videoUrl, nextItem?.videoUrl, prevItem?.videoUrl].filter(
        Boolean,
      ) as string[],
    [currentItem?.videoUrl, nextItem?.videoUrl, prevItem?.videoUrl],
  );

  useVideoCache(urlsToCache);

  const navigateToIndex = useCallback(
    (direction: "next" | "prev") => {
      if (isTransitioning || items.length === 0) return;
      setIsTransitioning(true);
      setCurrentIndex((prev) => {
        const next =
          direction === "next"
            ? (prev + 1) % items.length
            : (prev - 1 + items.length) % items.length;
        currentIdRef.current = items[next]?.id ?? null;
        return next;
      });
      setTimeout(() => setIsTransitioning(false), 800);
    },
    [isTransitioning, items.length],
  );

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/videos`)
      .then((r) => r.json())
      .then((videos: ApiVideo[]) => {
        const dbVideos: VideoData[] = videos
          .filter((v): v is ApiVideo & { playbackUrl: string } =>
            Boolean(v.playbackUrl),
          )
          .map((v) => ({
            id: v.id,
            title: v.title.charAt(0).toUpperCase() + v.title.slice(1),
            description: v.description ?? "",
            videoUrl: v.playbackUrl,
            hlsUrl: v.hlsUrl ?? null,
            type: "video" as const,
          }));
        if (dbVideos.length > 0) {
          setItems((prev) => {
            const live = prev.filter((i) => i.type === "live");
            const merged = [...live, ...dbVideos, ...videoData];
            const idx = merged.findIndex((i) => i.id === currentIdRef.current);
            if (idx !== -1) setCurrentIndex(idx);
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchStreams = () => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/streams`)
        .then((r) => r.json())
        .then((streams: any[]) => {
          const liveIds = new Set(
            streams
              .filter((s) => s.status === "LIVE" && s.playbackUrl)
              .map((s) => s.id),
          );
          const liveStreams: VideoData[] = streams
            .filter((s) => liveIds.has(s.id))
            .map((s) => ({
              id: s.id,
              title: s.title,
              description: s.description ?? "",
              videoUrl: s.playbackUrl,
              hlsUrl: s.playbackUrl,
              type: "live" as const,
            }));

          setItems((prev) => {
            const withoutStaleLive = prev.filter(
              (i) => i.type !== "live" || liveIds.has(i.id),
            );
            const newLive = liveStreams.filter(
              (s) => !withoutStaleLive.some((i) => i.id === s.id),
            );
            const merged = [...newLive, ...withoutStaleLive];
            const idx = merged.findIndex((i) => i.id === currentIdRef.current);
            if (idx !== -1) setCurrentIndex(idx);
            return merged;
          });
        })
        .catch(() => {});
    };

    fetchStreams();
    const interval = setInterval(fetchStreams, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      navigateToIndex(e.deltaY > 0 ? "next" : "prev");
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [navigateToIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    lastTouchTime.current = Date.now();
    touchMoved.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const distance = touchStartY.current - e.changedTouches[0].clientY;
    const duration = Date.now() - lastTouchTime.current;
    if (Math.abs(distance) > 50 && duration < 300) {
      touchMoved.current = true;
      navigateToIndex(distance > 0 ? "next" : "prev");
    }
  };

  const handleTitleClick = (index: number) => {
    if (touchMoved.current) {
      touchMoved.current = false;
      return;
    }
    const item = items[index];
    if (!item?.videoUrl) return;
    currentIdRef.current = item.id;
    setCurrentIndex(index);
    if (item.type === "live") {
      router.push(`/live/${item.id}`);
      return;
    }

    sessionStorage.setItem(
      "watchItem",
      JSON.stringify({
        title: item.title,
        playbackUrl: item.hlsUrl ?? item.videoUrl,
        description: item.description,
      }),
    );
    router.push("/watch");
  };

  return (
    <div
      className="h-screen w-full relative bg-black overflow-hidden"
      ref={wheelRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "none" }}
    >
      {currentItem.videoUrl && !currentFailed ? (
        <Video
          videoUrl={currentItem.videoUrl}
          nextVideoUrl={nextItem?.videoUrl}
          isTransitioning={isTransitioning}
          isLoaded={true}
          isLive={currentItem.type === "live"}
          isNextLive={nextItem?.type === "live"}
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-gray-900 via-gray-900 to-black flex items-center justify-center">
          <div className="text-center text-white">
            <div className="text-6xl mb-6 flex justify-center">
              {currentFailed ? <TriangleAlert /> : <Clapperboard />}
            </div>
            <h2 className="text-3xl font-bold mb-4">{currentItem.title}</h2>
            <p className="text-gray-300 max-w-md">
              {currentFailed ? "Video failed to load" : currentItem.description}
            </p>
            {currentFailed && (
              <button
                onClick={() =>
                  setFailedVideos((prev) => {
                    const s = new Set(prev);
                    s.delete(currentIndex);
                    return s;
                  })
                }
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="absolute top-1/10 bottom-1/2 right-1/6 z-20 p-8 "
      >
        <Title
          currentIndex={currentIndex}
          allTitles={items.map((i) => i.title)}
          itemIds={items.map((i) => i.id)}
          liveFlags={items.map((i) => i.type === "live")}
          onSelect={handleTitleClick}
        />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 text-white/60 text-sm animate-pulse">
        <span className="hidden sm:inline">Scroll to explore</span>
        <span className="sm:hidden">Swipe to explore</span>
      </div>
    </div>
  );
}
