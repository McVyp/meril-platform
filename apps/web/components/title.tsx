"use client";

import { Badge } from "./ui/badge";

interface TitleProps {
  currentIndex: number;
  allTitles: string[];
  itemIds: (string | number)[];
  liveFlags?: boolean[];
  aiFlags?: boolean[];
  onSelect: (index: number) => void;
}

export default function Title({
  currentIndex,
  allTitles,
  itemIds,
  liveFlags,
  aiFlags,
  onSelect,
}: TitleProps) {
  return (
    <div className="text-white max-w-4xl">
      {allTitles.map((titleItem, index) => {
        const isActive = index === currentIndex;
        const isLive = liveFlags?.[index] ?? false;
        const isAi = aiFlags?.[index] ?? false;
        return (
          <div
            key={itemIds[index]}
            onClick={() => onSelect(index)}
            className={`transition-all duration-300 select-none cursor-pointer ${
              isActive
                ? "text-white font-semibold"
                : "text-white/40 hover:text-white/60"
            } ${isLive || isAi ? "flex items-center gap-2" : ""}`}
          >
            <p className="text-[3rem] font-[family-name:var(--font-geist-pixel-square)]">
              {titleItem}
            </p>
            {isLive && (
              <Badge className="gap-1.5 border-none bg-red-600 text-white">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                LIVE
              </Badge>
            )}
            {isAi && (
              <Badge
                variant="outline"
                title="AI Generated"
                className="border-white/30 text-white/60"
              >
                AI
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
