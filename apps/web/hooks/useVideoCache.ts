import { useEffect } from "react";

const CACHE_NAME = "video-prefetch-v1";
const PREFETCH_BYTES = 512 * 1024;

export function useVideoCache(urls: string[]) {
  const urlKey = urls.join(",");

  useEffect(() => {
    if (!("caches" in window)) return;

    urls.forEach(async (url) => {
      if (!url) return;
      const cache = await caches.open(CACHE_NAME);

      const existing = await cache.match(url);
      if (existing) return;

      try {
        const res = await fetch(url, {
          headers: { Range: `bytes=0-${PREFETCH_BYTES}` },
        });
        if (res.status === 206 || res.status === 200) {
          await cache.put(url, res);
        }
      } catch {}
    });
  }, [urlKey]);
}