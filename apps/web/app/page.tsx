"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Title from "@/components/title";
import Video from "@/components/video";
import { ApiVideo, VideoData } from "@/types/video";
import { useVideoCache } from "@/hooks/useVideoCache";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import "./globals.css";
import UserMenu from "@/components/userMenu";
import { PublicStream } from "@/types/stream";
import { SearchBar, SearchStatus } from "@/components/searchBar";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export default function Home() {
  const router = useRouter();
  const lastShownItemRef = useRef<VideoData | null>(null);
  const [items, setItems] = useState<VideoData[]>([]);
  const currentIdRef = useRef<string | number | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const nextCursorRef = useRef<string | null>(null);
  const isFetchingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<VideoData[] | null>(null);

  const displayedItems = searchResults ?? items;

  const mapApiVideos = (videos: ApiVideo[]): VideoData[] =>
    videos
      .filter((v): v is ApiVideo & { playbackUrl?: string; hlsUrl?: string } =>
        Boolean(v.playbackUrl ?? v.hlsUrl),
      )
      .map((v) => ({
        id: v.id,
        title: v.title.charAt(0).toUpperCase() + v.title.slice(1),
        description: v.description ?? "",
        videoUrl: v.playbackUrl ?? v.hlsUrl!,
        hlsUrl: v.hlsUrl ?? null,
        type: "video" as const,
      }));

  const mapSearchResults = (videos: ApiVideo[]): VideoData[] =>
    videos.map((v) => ({
      id: v.id,
      title: v.title.charAt(0).toUpperCase() + v.title.slice(1),
      description: v.description ?? "",
      videoUrl: v.playbackUrl ?? v.hlsUrl ?? null,
      hlsUrl: v.hlsUrl ?? null,
      type: "video" as const,
    }));

  const fetchMoreVideos = useCallback(() => {
    if (isFetchingMoreRef.current || !hasMoreRef.current) return;
    isFetchingMoreRef.current = true;

    const url = nextCursorRef.current
      ? `/api/videos?cursor=${encodeURIComponent(nextCursorRef.current)}`
      : "/api/videos";

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch videos: ${r.status}`);
        return r.json();
      })
      .then((data: { videos: ApiVideo[]; nextCursor: string | null }) => {
        nextCursorRef.current = data.nextCursor;
        hasMoreRef.current = data.nextCursor !== null;

        const dbVideos = mapApiVideos(data.videos);
        if (dbVideos.length === 0) return;

        setItems((prev) => {
          const live = prev.filter((i) => i.type === "live");
          const existingDb = prev.filter((i) => i.type === "video");
          return [...live, ...existingDb, ...dbVideos];
        });
      })
      .catch((err) => {
        console.error("Failed to fetch more videos:", err);
      })
      .finally(() => {
        isFetchingMoreRef.current = false;
      });
  }, []);

  const {
    currentIndex,
    setCurrentIndex,
    isTransitioning,
    wheelRef,
    touchMoved,
    handleTouchStart,
    handleTouchEnd,
  } = useSwipeNavigation(
    displayedItems.length,
    (next) => {
      currentIdRef.current = displayedItems[next]?.id ?? null;
    },
    () => {
      if (!searchResults) fetchMoreVideos();
    },
  );

  const nextItem = displayedItems[(currentIndex + 1) % displayedItems.length];
  const prevItem =
    displayedItems[
      (currentIndex - 1 + displayedItems.length) % displayedItems.length
    ];
  const currentItem = displayedItems[currentIndex] ?? lastShownItemRef.current;

  useEffect(() => {
    if (displayedItems[currentIndex]) {
      lastShownItemRef.current = displayedItems[currentIndex];
    }
  }, [displayedItems, currentIndex]);

  const urlsToCache = useMemo(
    () =>
      [currentItem?.videoUrl, nextItem?.videoUrl, prevItem?.videoUrl].filter(
        Boolean,
      ) as string[],
    [currentItem?.videoUrl, nextItem?.videoUrl, prevItem?.videoUrl],
  );

  useVideoCache(urlsToCache);

  useEffect(() => {
    fetchMoreVideos();
  }, [fetchMoreVideos]);

  useEffect(() => {
    if (!currentIdRef.current && items.length > 0) {
      currentIdRef.current = items[0].id;
    }
    const idx = items.findIndex((i) => i.id === currentIdRef.current);
    if (idx !== -1) setCurrentIndex(idx);
  }, [items, setCurrentIndex]);

  useEffect(() => {
    const fetchStreams = () => {
      fetch(`/api/streams`)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch streams: ${r.status}`);
          return r.json();
        })
        .then(
          (data: { streams: PublicStream[]; nextCursor: string | null }) => {
            const streams = data.streams;
            const liveIds = new Set(
              streams
                .filter((s) => s.status === "LIVE" && s.playbackUrl)
                .map((s) => s.id),
            );
            const liveStreams: VideoData[] = streams
              .filter(
                (s): s is PublicStream & { playbackUrl: string } =>
                  liveIds.has(s.id) && Boolean(s.playbackUrl),
              )
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
              return [...newLive, ...withoutStaleLive];
            });
          },
        )
        .catch((err) => {
          console.error("Failed to fetch streams:", err);
        });
    };

    fetchStreams();
    const interval = setInterval(fetchStreams, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleTitleClick = (index: number) => {
    if (touchMoved.current) {
      touchMoved.current = false;
      return;
    }
    const item = displayedItems[index];
    if (!item?.videoUrl) return;
    currentIdRef.current = item.id;
    setCurrentIndex(index);
    if (item.type === "live") {
      router.push(`/live/${item.id}`);
      return;
    }

    try {
      sessionStorage.setItem(
        "watchItem",
        JSON.stringify({
          title: item.title,
          playbackUrl: item.hlsUrl ?? item.videoUrl,
          description: item.description,
        }),
      );
    } catch (err) {
      console.error("Failed to store watch item:", err);
    }
    router.push("/watch");
  };

  if (displayedItems.length === 0 && !searchActive) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center text-white/40 text-[1.4rem]">
        Loading videos...
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
      {currentItem?.videoUrl && (
        <Video
          videoUrl={currentItem.videoUrl}
          nextVideoUrl={nextItem?.videoUrl ?? undefined}
          isTransitioning={isTransitioning}
          isLoaded={true}
          isLive={currentItem.type === "live"}
          isNextLive={nextItem?.type === "live"}
        />
      )}

      <div className="absolute top-4 left-4 z-30">
        <UserMenu />
      </div>

      {isDesktop && (
        <div className="absolute top-20 left-4 ml-8 z-30 flex items-start gap-2">
          <SearchBar<ApiVideo>
            active={searchActive}
            onActiveChange={setSearchActive}
            onResults={(results) => {
              setSearchResults(results ? mapSearchResults(results) : null);
              setCurrentIndex(0);
            }}
            onStatusChange={setSearchStatus}
            fetchResults={(query, signal) =>
              fetch(`/api/videos/search?q=${encodeURIComponent(query)}`, {
                signal,
              })
                .then((r) => {
                  if (!r.ok) throw new Error(`Search failed: ${r.status}`);
                  return r.json();
                })
                .then((data: { videos: ApiVideo[] }) => data.videos)
            }
            placeholder="Search..."
          />
        </div>
      )}

      <div className="absolute top-[7%] right-1/6 z-30 p-8 flex flex-col items-start gap-4 min-w-[20vw]">
        {!isDesktop && (
          <SearchBar<ApiVideo>
            active={searchActive}
            onActiveChange={setSearchActive}
            onResults={(results) => {
              setSearchResults(results ? mapSearchResults(results) : null);
              setCurrentIndex(0);
            }}
            onStatusChange={setSearchStatus}
            fetchResults={(query, signal) =>
              fetch(`/api/videos/search?q=${encodeURIComponent(query)}`, {
                signal,
              })
                .then((r) => {
                  if (!r.ok) throw new Error(`Search failed: ${r.status}`);
                  return r.json();
                })
                .then((data: { videos: ApiVideo[] }) => data.videos)
            }
            placeholder="Search..."
          />
        )}

        {searchStatus === "searching" ? (
          <p className="text-white/40 text-[3rem]">Searching...</p>
        ) : searchStatus === "empty" ? (
          <p className="text-white/40 text-[3rem]">Not found</p>
        ) : (
          <Title
            currentIndex={currentIndex}
            allTitles={displayedItems.map((i) => i.title)}
            itemIds={displayedItems.map((i) => i.id)}
            liveFlags={displayedItems.map((i) => i.type === "live")}
            onSelect={handleTitleClick}
          />
        )}
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 text-white/60 text-sm animate-pulse">
        <span className="hidden sm:inline">
          Scroll to explore · Press / to search
        </span>
        <span className="sm:hidden">Swipe to explore</span>
      </div>
    </div>
  );
}
