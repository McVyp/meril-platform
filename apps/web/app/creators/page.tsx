"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Title from "@/components/title";
import Video from "@/components/video";
import { useVideoCache } from "@/hooks/useVideoCache";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import UserMenu from "@/components/userMenu";
import { ApiCreator, CreatorItem } from "@/types/creator";
import { SearchBar, SearchStatus } from "@/components/searchBar";

export default function CreatorsPage() {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const lastShownItemRef = useRef<CreatorItem | null>(null);

  const [items, setItems] = useState<CreatorItem[]>([]);
  const currentIdRef = useRef<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");

  const nextCursorRef = useRef<string | null>(null);
  const isFetchingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<CreatorItem[] | null>(
    null,
  );

  // whichever list is currently being browsed — the real feed, or search results
  const displayedItems = searchResults ?? items;

  const mapApiCreators = (creators: ApiCreator[]): CreatorItem[] =>
    creators
      .filter((c) => Boolean(c.bannerUrl || c.latestVideoUrl))
      .map((c) => ({
        id: c.id,
        username: c.username,
        title: c.name ?? "Unnamed",
        description: "",
        videoUrl: c.bannerUrl ?? c.latestVideoUrl,
        type: "creator" as const,
      }));

  const mapSearchResults = (creators: ApiCreator[]): CreatorItem[] =>
    creators.map((c) => ({
      id: c.id,
      username: c.username,
      title: c.name ?? "Unnamed",
      description: "",
      videoUrl: c.bannerUrl ?? c.latestVideoUrl ?? null,
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
      // only paginate the real feed, never while browsing search results
      if (!searchResults) fetchMoreCreators();
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
    fetchMoreCreators();
  }, [fetchMoreCreators]);

  const handleTitleClick = (index: number) => {
    if (touchMoved.current) {
      touchMoved.current = false;
      return;
    }
    const item = displayedItems[index];
    if (!item) return;
    currentIdRef.current = item.id;
    setCurrentIndex(index);
    router.push(`/creators/${item.username ?? item.id}`);
  };

  if (displayedItems.length === 0 && !searchActive) {
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
      {currentItem?.videoUrl && (
        <Video
          videoUrl={currentItem.videoUrl}
          nextVideoUrl={nextItem?.videoUrl ?? undefined}
          isTransitioning={isTransitioning}
          isLoaded={true}
          isLive={false}
          isNextLive={false}
        />
      )}

      <div className="absolute top-4 left-4 z-30">
        <UserMenu />
      </div>

      {isDesktop && (
        <div className="absolute top-20 left-4 ml-8 z-30 flex items-start gap-2">
          <SearchBar<ApiCreator>
            active={searchActive}
            onActiveChange={setSearchActive}
            onResults={(results) => {
              setSearchResults(results ? mapSearchResults(results) : null);
              setCurrentIndex(0);
            }}
            onStatusChange={setSearchStatus}
            fetchResults={(query, signal) =>
              fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
                signal,
              })
                .then((r) => r.json())
                .then((data: { users: ApiCreator[] }) => data.users)
            }
            placeholder="Search..."
          />
        </div>
      )}

      <div className="absolute top-[7%] right-1/6 z-30 p-8 flex flex-col items-start gap-4 min-w-[20vw]">
        {!isDesktop && (
          <SearchBar<ApiCreator>
            active={searchActive}
            onActiveChange={setSearchActive}
            onResults={(results) => {
              setSearchResults(results ? mapSearchResults(results) : null);
              setCurrentIndex(0);
            }}
            onStatusChange={setSearchStatus}
            fetchResults={(query, signal) =>
              fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
                signal,
              })
                .then((r) => r.json())
                .then((data: { users: ApiCreator[] }) => data.users)
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
            liveFlags={displayedItems.map(() => false)}
            onSelect={handleTitleClick}
          />
        )}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 text-white/60 text-sm animate-pulse">
        <span className="hidden sm:inline">
          {isDesktop
            ? "Scroll to explore · Press / to search"
            : "Scroll to explore"}
        </span>
        <span className="sm:hidden">Swipe to explore</span>
      </div>
    </div>
  );
}
