"use client";
import { useState, useRef, useEffect } from "react";
import Hls from "hls.js";

interface VideoProps {
  videoUrl: string;
  nextVideoUrl?: string;
  isTransitioning: boolean;
  isLoaded: boolean;
  isLive?: boolean;
  isNextLive?: boolean;
}

export default function Video({
  videoUrl,
  nextVideoUrl,
  isTransitioning,
  isLoaded,
  isLive = false,
  isNextLive = false,
}: VideoProps) {
  const [showSpinner, setShowSpinner] = useState(!isLoaded);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isLive && videoUrl.includes(".m3u8")) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          backBufferLength: 30,
          maxLiveSyncPlaybackRate: 1.5,
        });
        hlsRef.current = hls;
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
          setShowSpinner(false);
        });
        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoUrl;
      }
    } else {
      video.src = videoUrl;
    }
  }, [videoUrl, isLive]);

  useEffect(() => {
    if (!isLive) return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const hls = hlsRef.current;
      const video = videoRef.current;
      if (!hls || !video) return;
      const liveEdge = hls.liveSyncPosition;
      if (liveEdge == null) return;
      const drift = liveEdge - video.currentTime;
      if (drift > 5) {
        video.currentTime = liveEdge;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLive]);

  return (
    <div className="absolute inset-0 z-10">
      {showSpinner && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
        </div>
      )}

      {/* Current video */}
      <video
        ref={videoRef}
        autoPlay
        loop={!isLive}
        muted
        playsInline
        preload="auto"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          isTransitioning ? "opacity-90" : "opacity-100"
        }`}
        onLoadedData={() => setShowSpinner(false)}
        onWaiting={() => setShowSpinner(true)}
        onCanPlay={() => setShowSpinner(false)}
        onError={() => setShowSpinner(false)}
      />

      {/* Silently preload next video — skipped for live, hls.js needed to play those */}
      {nextVideoUrl && !isNextLive && (
        <video
          src={nextVideoUrl}
          preload="auto"
          muted
          playsInline
          className="hidden"
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/30" />
      <div className="container" />
    </div>
  );
}
