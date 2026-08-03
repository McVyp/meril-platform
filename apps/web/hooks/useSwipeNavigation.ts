import { useCallback, useEffect, useRef, useState } from "react";

export function useSwipeNavigation(
  itemCount: number,
  onNavigate: (index: number) => void,
  onApproachingEnd?: () => void,
) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const lastTouchTime = useRef(0);
  const touchMoved = useRef(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const navigateToIndex = useCallback(
    (direction: "next" | "prev") => {
      if (isTransitioning || itemCount === 0) return;
      const next =
        direction === "next"
          ? (currentIndex + 1) % itemCount
          : (currentIndex - 1 + itemCount) % itemCount;

      setIsTransitioning(true);
      setCurrentIndex(next);
      onNavigate(next);
      if (direction === "next" && next >= itemCount - 3) {
        onApproachingEnd?.();
      }

      transitionTimeoutRef.current = setTimeout(
        () => setIsTransitioning(false),
        800,
      );
    },
    [isTransitioning, itemCount, currentIndex, onNavigate, onApproachingEnd],
  );

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
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

  return {
    currentIndex,
    setCurrentIndex,
    isTransitioning,
    wheelRef,
    touchMoved,
    handleTouchStart,
    handleTouchEnd,
    navigateToIndex,
  };
}
