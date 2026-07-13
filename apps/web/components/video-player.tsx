"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { Badge } from "./ui/badge";

interface VideoPlayerProps {
  src: string;
  title: string;
  isLive?: boolean;
  showLiveBadge?: boolean;
}

function SpeakerOnIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" />
      <path
        d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" />
      <path
        d="M16 9l5 6M21 9l-5 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function VideoPlayer({
  src,
  title,
  isLive = false,
  showLiveBadge = true,
}: VideoPlayerProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [qualities, setQualities] = useState<
    { label: string; level: number }[]
  >([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);

  // HLS setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (src.includes(".m3u8")) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: isLive,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          backBufferLength: isLive ? 30 : Infinity,
          maxLiveSyncPlaybackRate: 1.5,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = hls.levels.map((l, i) => ({
            label: l.height ? `${l.height}p` : `Level ${i}`,
            level: i,
          }));
          const orderedLevels = [...levels].reverse();
          setQualities([{ label: "Auto", level: -1 }, ...orderedLevels]);

          const preferred = orderedLevels.find((l) => l.label === "720p");
          if (preferred) {
            hls.currentLevel = preferred.level;
            setCurrentQuality(preferred.level);
          } else {
            setCurrentQuality(-1);
          }

          if (isLive) {
            video.play().catch(() => {});
            setHasStarted(true);
          }
        });

        return () => {
          hls.destroy();
          hlsRef.current = null;
        };
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      }
    } else {
      video.src = src;
      return () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }
  }, [src, isLive]);

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

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
      setHasStarted(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || isLive) return;
    const pct = (v.currentTime / v.duration) * 100;
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${pct}%`;
    }
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const newMuted = !muted;
    setMuted(newMuted);
    v.muted = newMuted;
  }, [muted]);

  const cycleQuality = () => {
    const hls = hlsRef.current;
    if (!hls || qualities.length === 0) return;
    const currentIndex = qualities.findIndex((q) => q.level === currentQuality);
    const nextIndex = (currentIndex + 1) % qualities.length;
    const next = qualities[nextIndex];
    hls.currentLevel = next.level;
    setCurrentQuality(next.level);
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setShowControls(false), 1000);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setShowControls(true);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    }
  }, [isFullscreen]);

  return (
    <div
      ref={containerRef}
      className="relative bg-black w-full h-full overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
        muted={muted}
      />

      {/* LIVE badge — top overlay, always visible while live and started */}
      {isLive && hasStarted && showLiveBadge && (
        <Badge
          variant="destructive"
          className="absolute top-4 left-4 z-10 bg-red-600 text-white border-0"
        >
          LIVE
        </Badge>
      )}

      {!hasStarted && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center cursor-pointer group"
        >
          <div className="w-[8vw] h-[8vw] min-w-16 min-h-16 rounded-full border-3 border-white group-hover:border-white/80 flex items-center justify-center transition-all duration-300">
            <span className="text-white group-hover:text-white/80 text-[1.5rem] transition-all duration-300">
              Play
            </span>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div
          className={`absolute top-0 left-0 right-0 px-8 py-6 flex items-center gap-6
            bg-gradient-to-b from-black/50 to-transparent transition-opacity duration-500
            ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <button
            onClick={() => document.exitFullscreen()}
            className="text-white/60 hover:text-white text-[2rem] cursor-pointer transition-colors"
          >
            ←
          </button>
          <span className="text-white/80 text-[2rem] tracking-wide">
            {title}
          </span>
        </div>
      )}

      {hasStarted && (
        <div
          className={`absolute bottom-0 left-0 right-0 px-5 py-4 transition-opacity duration-500
            ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}
            ${isFullscreen ? "bg-gradient-to-t from-black/50 to-transparent" : ""}`}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="text-white/50 text-[1.5rem] font-bold shrink-0 cursor-pointer hover:text-white transition-colors"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            {isLive ? (
              <div className="flex-1" />
            ) : (
              <div
                className="flex-1 h-px bg-[#ffffff80] cursor-pointer relative"
                onClick={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  v.currentTime = pct * v.duration;
                  if (progressBarRef.current)
                    progressBarRef.current.style.width = `${pct * 100}%`;
                }}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-white"
                  ref={progressBarRef}
                  style={{ width: "0%" }}
                />
              </div>
            )}

            {isLive && (
              <button
                onClick={toggleMute}
                className="text-white/50 text-[1.5rem] font-bold shrink-0 cursor-pointer hover:text-white transition-colors"
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? <SpeakerMutedIcon /> : <SpeakerOnIcon />}
              </button>
            )}
            {isLive && qualities.length > 1 && (
              <button
                onClick={cycleQuality}
                className="text-white text-[1.5rem] font-bold shrink-0 cursor-pointer hover:text-white/80 transition-colors"
                title="Click to change quality"
              >
                {qualities.find((q) => q.level === currentQuality)?.label ??
                  "Auto"}
              </button>
            )}

            <button
              onClick={handleFullscreen}
              className={`text-white/50 text-[1.5rem] font-bold shrink-0 cursor-pointer hover:text-white transition-colors ${isFullscreen ? "px-10 py-4" : ""}`}
            >
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
