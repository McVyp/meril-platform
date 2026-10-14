import { sendView } from "@/lib/interactions";
import { useCallback, useEffect, useRef } from "react";

export function useVideoInteraction(
  videoId: string | undefined,
  isLive: boolean,
) {
  const watchedRef = useRef(0);
  const durationRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  const flushView = useCallback(() => {
    if (!videoId || isLive) return;

    sendView(videoId, watchedRef.current, durationRef.current);
    watchedRef.current = 0;
    lastTimeRef.current = null;
  }, [videoId, isLive]);

  useEffect(() => () => flushView(), [flushView]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushView();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushView);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushView);
    };
  }, [flushView]);

  const onTimeUpdate = useCallback(
    (v: HTMLVideoElement) => {
      if (isLive) return;
      if (Number.isFinite(v.duration)) durationRef.current = v.duration;
      if (v.paused) return;
      const t = v.currentTime;
      if (lastTimeRef.current !== null) {
        const delta = t - lastTimeRef.current;
        if (delta > 0 && delta < 2) watchedRef.current += delta;
      }
      lastTimeRef.current = t;
    },
    [isLive],
  );

  const onSeeking = useCallback(() => {
    lastTimeRef.current = null;
  }, []);

  return {
    onTimeUpdate,
    onSeeking,
  };
}
