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

  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);
  const preloadHlsRef = useRef<Hls | null>(null);
  const preloadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // If we already preloaded this exact URL on the hidden preload element,
    // hand its underlying Hls instance off to the visible <video> instead of
    // starting a brand new load from zero.
    if (
      videoUrl.includes(".m3u8") &&
      preloadedUrlRef.current === videoUrl &&
      preloadHlsRef.current
    ) {
      const hls = preloadHlsRef.current;
      hlsRef.current = hls;
      preloadHlsRef.current = null;
      preloadedUrlRef.current = null;

      hls.detachMedia();
      hls.attachMedia(video);
      video.play().catch(() => {});
      setShowSpinner(false);

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (videoUrl.includes(".m3u8")) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: isLive,
          liveSyncDurationCount: isLive ? 3 : undefined,
          liveMaxLatencyDurationCount: isLive ? 6 : undefined,
          backBufferLength: 30,
          maxLiveSyncPlaybackRate: isLive ? 1.5 : 1,
          capLevelToPlayerSize: false,
        });
        hlsRef.current = hls;
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          hls.currentLevel = hls.levels.length - 1;
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
    if (!nextVideoUrl || isNextLive) return;
    if (nextVideoUrl === videoUrl) return;
    if (preloadedUrlRef.current === nextVideoUrl) return;

    if (preloadHlsRef.current) {
      preloadHlsRef.current.destroy();
      preloadHlsRef.current = null;
    }
    preloadedUrlRef.current = nextVideoUrl;

    if (nextVideoUrl.includes(".m3u8") && Hls.isSupported()) {
      const hiddenVideo = preloadVideoRef.current;
      if (!hiddenVideo) return;
      const hls = new Hls({ capLevelToPlayerSize: false });
      preloadHlsRef.current = hls;
      hls.loadSource(nextVideoUrl);
      hls.attachMedia(hiddenVideo);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hls.currentLevel = hls.levels.length - 1;
      });
    } else if (preloadVideoRef.current) {
      preloadVideoRef.current.src = nextVideoUrl;
      preloadVideoRef.current.load();
    }

    return () => {
      if (preloadHlsRef.current) {
        preloadHlsRef.current.destroy();
        preloadHlsRef.current = null;
      }
    };
  }, [nextVideoUrl, isNextLive, videoUrl]);

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

      {/* Hidden element used to silently warm up the next video (HLS or plain) */}
      <video
        ref={preloadVideoRef}
        muted
        playsInline
        preload="auto"
        className="hidden"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/30" />
      <div className="container" />
    </div>
  );
}
