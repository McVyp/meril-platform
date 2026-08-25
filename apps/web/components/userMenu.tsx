"use client";

import { useState } from "react";
import { useSession } from "@/context/SessionContext";
import SettingsModal from "./settings";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export default function UserMenu() {
  const { loaded, loggedIn, name, email } = useSession();
  const [modalOpen, setModalOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const displayName = name ?? email?.split("@")[0] ?? null;

  if (!loaded || !loggedIn || !displayName) return null;

  return (
    <>
      <span className="group relative inline-flex flex-col items-start">
        <span
          role="button"
          tabIndex={0}
          onClick={() => setModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setModalOpen(true);
            }
          }}
          className="relative cursor-pointer text-[2rem] font-medium text-white outline-none"
        >
          {displayName}
          <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white transition-all duration-300 group-hover:w-full" />
        </span>
        <a
          href={isMobile ? "/mobile" : "/studio"}
          className="ml-0 max-w-0 -translate-x-2 overflow-hidden whitespace-nowrap opacity-0 text-[2rem] font-medium text-white transition-all duration-300 group-hover:max-w-[8rem] group-hover:translate-x-0 group-hover:opacity-100"
        >
          Stream
        </a>
      </span>
      <SettingsModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
