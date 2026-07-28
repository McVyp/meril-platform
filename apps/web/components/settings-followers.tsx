"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/get-initials";
import { PublicUser } from "@/types/stream";

interface FollowListResponse {
  followers?: PublicUser[];
  following?: PublicUser[];
  nextCursor: string | null;
}

function UserCard({
  user,
  showUnfollow,
  onUnfollow,
  onNavigate,
}: {
  user: PublicUser;
  showUnfollow: boolean;
  onUnfollow?: (userId: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors">
      <Link
        href={`/creators/${user.id}`}
        onClick={onNavigate}
        className="flex items-center gap-3 min-w-0"
      >
        <Avatar className="w-10 h-10 shrink-0">
          <AvatarImage
            src={user.image ?? undefined}
            alt={user.name ?? "User"}
          />
          <AvatarFallback className="text-[1.1rem] bg-white/10">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="text-[1.15rem] truncate">
          {user.name ?? "Unnamed user"}
        </span>
      </Link>
      {showUnfollow && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer text-[1rem] px-3 h-7 shrink-0"
          onClick={() => onUnfollow?.(user.id)}
        >
          Unfollow
        </Button>
      )}
    </div>
  );
}

function FollowList({
  userId,
  kind,
}: {
  userId: string;
  kind: "followers" | "following";
}) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const fetchPage = async (after?: string | null) => {
    const qs = after ? `?cursor=${after}` : "";
    const res = await fetch(`/api/users/${userId}/${kind}${qs}`);
    if (!res.ok) throw new Error(`Failed to load ${kind}: ${res.status}`);
    const data: FollowListResponse = await res.json();
    const page = data[kind] ?? [];
    setUsers((prev) => (after ? [...prev, ...page] : page));
    setCursor(data.nextCursor);
  };

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchPage()
      .catch((err) => {
        console.error(`Failed to load ${kind}:`, err);
        setError(true);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, kind]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchPage(cursor);
    } catch (err) {
      console.error(`Failed to load more ${kind}:`, err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleUnfollow = async (targetUserId: string) => {
    const prev = users;
    setUsers((cur) => cur.filter((u) => u.id !== targetUserId));
    try {
      const res = await fetch(`/api/follows/${targetUserId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Unfollow failed: ${res.status}`);
    } catch (err) {
      console.error("Failed to unfollow:", err);
      setUsers(prev);
    }
  };

  if (loading) {
    return <p className="text-[1.2rem] text-muted-foreground">Loading...</p>;
  }

  if (error) {
    return (
      <p className="text-[1.2rem] text-destructive">
        Couldn't load {kind}. Try again.
      </p>
    );
  }

  if (users.length === 0) {
    return (
      <p className="text-[1.2rem] text-muted-foreground">
        {kind === "followers"
          ? "No followers yet."
          : "Not following anyone yet."}
      </p>
    );
  }

  const filtered = search.trim()
    ? users.filter((u) =>
        (u.name ?? "").toLowerCase().includes(search.trim().toLowerCase()),
      )
    : users;

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder={`Search ${kind}...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9 text-[1.2rem] max-w-xs"
      />

      {filtered.length === 0 ? (
        <p className="text-[1.2rem] text-muted-foreground">
          No {kind} match "{search}".
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {filtered.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              showUnfollow={kind === "following"}
              onUnfollow={handleUnfollow}
            />
          ))}
        </div>
      )}

      {cursor && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loadingMore}
            onClick={handleLoadMore}
            className="cursor-pointer"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function FollowersSection({ userId }: { userId: string }) {
  return <FollowList userId={userId} kind="followers" />;
}

export function FollowingSection({ userId }: { userId: string }) {
  return <FollowList userId={userId} kind="following" />;
}
