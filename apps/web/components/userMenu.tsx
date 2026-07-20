"use client";

import { useState } from "react";
import { useSession } from "@/context/SessionContext";
import SettingsModal from "./settings";

export default function UserMenu() {
  const { loaded, loggedIn, name, email } = useSession();
  const [modalOpen, setModalOpen] = useState(false);

  const displayName = name ?? email?.split("@")[0] ?? null;

  if (!loaded || !loggedIn || !displayName) return null;

  return (
    <>
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
        className="group relative ml-8 inline-block cursor-pointer text-[2rem] font-medium text-white"
      >
        {displayName}
        <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white transition-all duration-300 group-hover:w-full" />
      </span>
      <SettingsModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
