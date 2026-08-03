"use client";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export type SearchStatus = "idle" | "searching" | "empty" | "results";

interface SearchBarProps<T> {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  onResults: (results: T[] | null) => void;
  onStatusChange?: (status: SearchStatus) => void;
  fetchResults: (query: string, signal: AbortSignal) => Promise<T[]>;
  placeholder?: string;
}

export function SearchBar<T>({
  active,
  onActiveChange,
  onResults,
  onStatusChange,
  fetchResults,
  placeholder = "Search...",
}: SearchBarProps<T>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchResultsRef = useRef(fetchResults);
  const onResultsRef = useRef(onResults);
  const onStatusChangeRef = useRef(onStatusChange);
  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    fetchResultsRef.current = fetchResults;
    onResultsRef.current = onResults;
    onStatusChangeRef.current = onStatusChange;
    onActiveChangeRef.current = onActiveChange;
  });

  useEffect(() => {
    if (!active) return;

    if (!query.trim()) {
      onResultsRef.current(null);
      onStatusChangeRef.current?.("idle");
      return;
    }

    const controller = new AbortController();
    onStatusChangeRef.current?.("searching");
    const timeout = setTimeout(() => {
      fetchResultsRef
        .current(query, controller.signal)
        .then((results) => {
          onResultsRef.current(results);
          onStatusChangeRef.current?.(
            results.length === 0 ? "empty" : "results",
          );
        })
        .catch((err) => {
          if (err instanceof Error && err.name !== "AbortError") {
            console.error("Search failed:", err);
          }
        });
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, active]);

  useEffect(() => {
    if (!isDesktop) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        onActiveChangeRef.current(true);
      }
      if (e.key === "Escape" && active) {
        onActiveChangeRef.current(false);
        setQuery("");
        onResultsRef.current(null);
        onStatusChangeRef.current?.("idle");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, active]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const positionClass = "flex items-start gap-2";

  const inputClass = isDesktop
    ? "bg-transparent text-white placeholder:text-white/40 text-[1.3rem] outline-none border-0 border-b border-white/30 focus:border-white pb-1 transition-[width] duration-150"
    : "bg-transparent text-white placeholder:text-white/40 text-[1.1rem] outline-none border-0 border-b border-white/30 focus:border-white pb-1 text-left transition-[width] duration-150";

  if (!isDesktop && !active) {
    return (
      <button
        onClick={() => onActiveChange(true)}
        className="text-white/50 text-[1.1rem]"
      >
        Search
      </button>
    );
  }

  if (!active) return null;

  return (
    <div className={positionClass}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{ width: `${Math.min(Math.max(query.length, 8), 40)}ch` }}
        className={inputClass}
      />
    </div>
  );
}
