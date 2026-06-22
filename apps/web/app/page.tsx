"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Title from "@/components/title";
import Video from "@/components/video";
import { videoData } from "@/data/videos";
import { VideoData } from "@/types/video";
import { Clapperboard, TriangleAlert } from "lucide-react";
import { useVideoCache } from "@/hooks/useVideoCache";
import "./globals.css";

export default function Home() {
  const router = useRouter();
  const [items] = useState<VideoData[]>(videoData);
  const [currentIndex, setCurrentIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [failedVideos, setFailedVideos] = useState<Set<number>>(new Set());

  const wheelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const lastTouchTime = useRef(0);
  const touchMoved = useRef(false);

  const urlsToCache = [
    items[currentIndex]?.videoUrl,
    items[(currentIndex + 1) % items.length]?.videoUrl,
    items[(currentIndex - 1 + items.length) % items.length]?.videoUrl,
  ].filter(Boolean) as string[];

  useVideoCache(urlsToCache);

  const navigateToIndex = useCallback(
    (direction: "next" | "prev") => {
      if (isTransitioning || items.length === 0) return;
      setIsTransitioning(true);
      setCurrentIndex((prev) =>
        direction === "next"
          ? (prev + 1) % items.length
          : (prev - 1 + items.length) % items.length,
      );
      setTimeout(() => setIsTransitioning(false), 800);
    },
    [isTransitioning, items.length],
  );

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

  const handleTitleClick = () => {
    if (touchMoved.current) {
      touchMoved.current = false;
      return;
    }
    const item = items[currentIndex];
    if (!item?.videoUrl) return;
    sessionStorage.setItem(
      "watchItem",
      JSON.stringify({
        title: item.title,
        playbackUrl: item.videoUrl,
        description: item.description,
      }),
    );
    router.push("/watch");
  };

  const currentItem = items[currentIndex];
  const currentFailed = failedVideos.has(currentIndex);

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
          nextVideoUrl={items[(currentIndex + 1) % items.length]?.videoUrl}
          isTransitioning={isTransitioning}
          isLoaded={true}
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
        className="absolute bottom-1/2 right-1/6 z-20 p-8 cursor-pointer"
        onClick={handleTitleClick}
      >
        <Title
          currentIndex={currentIndex}
          allTitles={items.map((i) => i.title)}
        />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 text-white/60 text-sm animate-pulse">
        <span className="hidden sm:inline">Scroll to explore</span>
        <span className="sm:hidden">Swipe to explore</span>
      </div>
    </div>
  );
}
