import { useCallback, useEffect, useRef, useState } from "react";

export function useChatPopout(streamId: string | null) {
  const windowRef = useRef<Window | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const storageKey = streamId ? `studio-chat-open:${streamId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    setIsOpen(localStorage.getItem(storageKey) === "1");

    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const open = e.newValue === "1";
      setIsOpen(open);
      if (!open) windowRef.current = null;
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      if (windowRef.current?.closed) {
        windowRef.current = null;
        setIsOpen(false);
        if (storageKey) localStorage.removeItem(storageKey);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isOpen, storageKey]);

  const open = useCallback(() => {
    if (!streamId) return;
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
      return;
    }
    windowRef.current = window.open(
      `/studio/chat?streamId=${streamId}`,
      "studio-chat",
      "width=380,height=640,resizable=yes",
    );
    setIsOpen(true);
  }, [streamId]);

  const bringBack = useCallback(() => {
    windowRef.current?.close();
    windowRef.current = null;
    setIsOpen(false);
    if (storageKey) localStorage.removeItem(storageKey);
  }, [storageKey]);

  useEffect(() => () => windowRef.current?.close(), []);

  return { isOpen, open, bringBack };
}
