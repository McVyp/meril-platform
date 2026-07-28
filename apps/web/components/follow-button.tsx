"use client";

import { useEffect, useState } from "react";

interface FollowButtonProps {
  targetUserId: string;
  currentUserId: string | null; // null if logged out
}

export function FollowButton({
  targetUserId,
  currentUserId,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!currentUserId || currentUserId === targetUserId) {
      setLoading(false);
      return;
    }
    fetch(`/api/follows/${targetUserId}/status`)
      .then((r) => (r.ok ? r.json() : { isFollowing: false }))
      .then((data) => setIsFollowing(data.isFollowing ?? false))
      .catch((err) => console.error("Failed to load follow status:", err))
      .finally(() => setLoading(false));
  }, [targetUserId, currentUserId]);

  // don't show a follow button on your own stream, or before we know who's viewing.
  if (!currentUserId || currentUserId === targetUserId || loading) return null;

  const handleClick = async () => {
    const next = !isFollowing;
    setIsFollowing(next);
    setPending(true);
    try {
      const res = await fetch(`/api/follows/${targetUserId}`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok && res.status !== 409) {
        throw new Error(`Follow toggle failed: ${res.status}`);
      }
    } catch (err) {
      console.error("Failed to toggle follow:", err);
      setIsFollowing(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={
        isFollowing
          ? "px-4 py-1.5 rounded-full text-[1.2rem] font-medium bg-white/10 text-white/80 hover:bg-white/15 transition-colors disabled:opacity-50"
          : "px-4 py-1.5 rounded-full text-[1.2rem] font-medium bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50"
      }
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
