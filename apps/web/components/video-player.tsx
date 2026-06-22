"use client";
import { useRef, useState, useEffect, useCallback } from "react";

interface VideoPlayerProps {
  src: string;
  title: string;
}

export default function VideoPlayer({ src, title }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  const togglePlay = () => {
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
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setProgress((v.currentTime / v.duration) * 100);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
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
      className="relative bg-black w-full aspect-video max-h-[calc(100vh-120px)] overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
      />

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
          <span className="text-white/80 text-[2rem] tracking-wide">{title}</span>
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
              className="text-white text-[1.5rem] font-bold shrink-0"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <div
              className="flex-1 h-px bg-[#ffffff80] cursor-pointer relative"
              onClick={(e) => {
                const v = videoRef.current;
                if (!v) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                v.currentTime = pct * v.duration;
                setProgress(pct * 100);
              }}
            >
              <div
                className="absolute top-0 left-0 h-full bg-white"
                style={{ width: `${progress}%` }}
              />
            </div>

            <button
              onClick={handleFullscreen}
              className="text-white text-[1.5rem] font-bold shrink-0"
            >
              {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
