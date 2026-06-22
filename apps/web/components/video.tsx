"use client";
import React, { useState, useRef } from "react";

interface VideoProps {
  videoUrl: string;
  nextVideoUrl?: string;
  isTransitioning: boolean;
  isLoaded: boolean;
}

export default function Video({ videoUrl, nextVideoUrl, isTransitioning, isLoaded }: VideoProps) {
  const [showSpinner, setShowSpinner] = useState(!isLoaded);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
        src={videoUrl}
        autoPlay
        loop
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

      {/* Silently preload next video */}
      {nextVideoUrl && (
        <video
          src={nextVideoUrl}
          preload="auto"
          muted
          playsInline
          className="hidden"
        />
      )}

      {/* Cinematic gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

      {/* Vignette effect */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/30" />

      <div className="container" />
    </div>
  );
}