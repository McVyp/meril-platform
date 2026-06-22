"use client";

interface TitleProps {
  currentIndex: number;
  allTitles: string[];
}

export default function Title({ currentIndex, allTitles }: TitleProps) {
  return (
    <div className="text-white max-w-4xl">
      {allTitles.map((titleItem, index) => {
        const isActive = index === currentIndex;
        return (
          <div
            key={index}
            className={`transition-all duration-300 select-none ${
              isActive
                ? "text-white font-semibold"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            <p className="text-[3rem] font-[family-name:var(--font-geist-pixel-square)]">
              {titleItem}
            </p>
          </div>
        );
      })}
    </div>
  );
}
