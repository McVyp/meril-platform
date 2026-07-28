"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { UserProfile } from "@/types/stream";
import { FollowButton } from "@/components/follow-button";
import { useSession } from "@/context/SessionContext";
import VideoPlayer from "@/components/video-player";

function RevealOnScroll({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default function CreatorProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const { id: currentUserId } = useSession();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${userId}/profile`)
      .then((r) => {
        if (!r.ok) throw new Error(`Profile fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data: UserProfile) => setProfile(data))
      .catch((err) => {
        console.error("Failed to load profile:", err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-dvh bg-black flex items-center justify-center text-white/40 text-[1.4rem]">
        {loadError
          ? "Couldn't load this profile — try refreshing."
          : "User not found."}
      </div>
    );
  }

  const isOwnProfile = currentUserId === profile.user.id;
  const hasFooterContent =
    profile.user.bio ||
    (profile.user.socialLinks && profile.user.socialLinks.length > 0);

  return (
    <div className="min-h-dvh bg-black">
      {/* Header */}
      <div className="px-8 sm:px-16 pt-16 pb-10 flex items-center justify-center gap-4">
        <div>
          <h1 className="text-white text-[3rem] sm:text-[4rem] font-semibold leading-none tracking-tight">
            {profile.user.name ?? "Unnamed"}
          </h1>
          <div className="flex items-center justify-center gap-4 mt-3 text-white/40 text-[1.2rem]">
            <span>{profile.followerCount.toLocaleString()} followers</span>
            {!isOwnProfile && (
              <FollowButton
                targetUserId={profile.user.id}
                currentUserId={currentUserId}
              />
            )}
          </div>
        </div>
      </div>

      {/* Works — stacked rows, alternating sides, reveal on scroll */}
      <div className="flex flex-col">
        {profile.videos.map((video, index) => {
          const isReversed = index % 2 === 1;

          return (
            <RevealOnScroll key={video.id}>
              <div
                className={`grid grid-cols-1 ${
                  isReversed
                    ? "sm:grid-cols-[1fr_200px]"
                    : "sm:grid-cols-[200px_1fr]"
                } gap-4 sm:gap-8 px-8 sm:px-16 py-6 border-t border-white/10`}
              >
                <div
                  className={`flex sm:items-center ${
                    isReversed ? "sm:order-2" : "sm:order-1"
                  }`}
                >
                  <span className="text-white/70 text-[1.4rem] font-medium">
                    {video.title}
                  </span>
                </div>

                <div
                  className={`relative aspect-video w-full rounded-lg overflow-hidden bg-white/5 ${
                    isReversed ? "sm:order-1" : "sm:order-2"
                  }`}
                >
                  {video.hlsUrl ? (
                    <VideoPlayer src={video.hlsUrl} title={video.title} />
                  ) : video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
              </div>
            </RevealOnScroll>
          );
        })}
      </div>

      {/* About + social links */}
      {hasFooterContent && (
        <div className="px-8 sm:px-16 py-16 border-t border-white/10 flex flex-col gap-8">
          {profile.user.bio && (
            <div className="flex-1 max-w-2xl space-y-4">
              {profile.user.bio
                .split("\n")
                .filter((p) => p.trim().length > 0)
                .map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-white/50 text-[1.3rem] leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}
            </div>
          )}

          {profile.user.socialLinks && profile.user.socialLinks.length > 0 && (
            <ul className="space-y-2">
              {profile.user.socialLinks.map((link, i) => (
                <li key={i}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/50 text-[1.2rem] hover:underline underline-offset-4"
                  >
                    {link.platform}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
