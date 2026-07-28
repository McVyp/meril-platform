"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Title from "@/components/title";
import Video from "@/components/video";
import { Clapperboard, TriangleAlert } from "lucide-react";
import { useVideoCache } from "@/hooks/useVideoCache";
import UserMenu from "@/components/userMenu";
import { ApiCreator, CreatorItem } from "@/types/creator";

export default function CreatorsPage() {
  const router = useRouter();
  const [items, setItems] = useState<CreatorItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [failedItems, setFailedItems] = useState<Set<number>>(new Set());
  const currentIdRef = useRef<string | null>(null);

  const nextCursorRef = useRef<string | null>(null);
  const isFetchingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  const wheelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const lastTouchTime = useRef(0);
  const touchMoved = useRef(false);

  const nextItem = items[(currentIndex + 1) % items.length];
  const prevItem = items[(currentIndex - 1 + items.length) % items.length];
  const currentItem = items[currentIndex];
  const currentFailed = failedItems.has(currentIndex);

  const urlsToCache = useMemo(
    () =>
      [currentItem?.videoUrl, nextItem?.videoUrl, prevItem?.videoUrl].filter(
        Boolean,
      ) as string[],
    [currentItem?.videoUrl, nextItem?.videoUrl, prevItem?.videoUrl],
  );

  useVideoCache(urlsToCache);

  const mapApiCreators = (creators: ApiCreator[]): CreatorItem[] =>
    creators
      .filter((c) => Boolean(c.bannerUrl || c.latestVideoUrl))
      .map((c) => ({
        id: c.id,
        title: c.name ?? "Unnamed",
        description: "",
        videoUrl: c.bannerUrl ?? c.latestVideoUrl,
        type: "creator" as const,
      }));

  const fetchMoreCreators = useCallback(() => {
    if (isFetchingMoreRef.current || !hasMoreRef.current) return;
    isFetchingMoreRef.current = true;

    const url = nextCursorRef.current
      ? `/api/users?cursor=${encodeURIComponent(nextCursorRef.current)}`
      : "/api/users";

    fetch(url)
      .then((r) => r.json())
      .then((data: { users: ApiCreator[]; nextCursor: string | null }) => {
        nextCursorRef.current = data.nextCursor;
        hasMoreRef.current = data.nextCursor !== null;

        const mapped = mapApiCreators(data.users);
        if (mapped.length === 0) return;

        setItems((prev) => {
          const merged = [...prev, ...mapped];
          if (!currentIdRef.current && merged.length > 0) {
            currentIdRef.current = merged[0].id;
          }
          return merged;
        });
      })
      .catch((err) => {
        console.error("Failed to fetch creators:", err);
      })
      .finally(() => {
        isFetchingMoreRef.current = false;
      });
  }, []);

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

        if (direction === "next" && next >= items.length - 3) {
          fetchMoreCreators();
        }
        return next;
      });
      setTimeout(() => setIsTransitioning(false), 800);
    },
    [isTransitioning, items.length, fetchMoreCreators],
  );

  useEffect(() => {
    fetchMoreCreators();
  }, [fetchMoreCreators]);

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
    if (!item) return;
    currentIdRef.current = item.id;
    setCurrentIndex(index);
    router.push(`/creators/${item.id}`);
  };

  if (items.length === 0) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center text-white/40 text-[1.4rem]">
        Loading creators...
      </div>
    );
  }

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
          nextVideoUrl={nextItem?.videoUrl ?? undefined}
          isTransitioning={isTransitioning}
          isLoaded={true}
          isLive={false}
          isNextLive={false}
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-gray-900 via-gray-900 to-black flex items-center justify-center">
          <div className="text-center text-white">
            <div className="text-6xl mb-6 flex justify-center">
              {currentFailed ? <TriangleAlert /> : <Clapperboard />}
            </div>
            <h2 className="text-3xl font-bold mb-4">{currentItem.title}</h2>
            {currentFailed && (
              <button
                onClick={() =>
                  setFailedItems((prev) => {
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

      <div className="absolute top-4 left-4 z-30">
        <UserMenu />
      </div>
      <div className="absolute top-1/10 bottom-1/2 right-1/6 z-20 p-8">
        <Title
          currentIndex={currentIndex}
          allTitles={items.map((i) => i.title)}
          itemIds={items.map((i) => i.id)}
          liveFlags={items.map(() => false)}
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
