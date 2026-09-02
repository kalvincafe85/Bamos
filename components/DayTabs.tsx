import type { Day } from "@/lib/schema";

export default function DayTabs({
  days,
  activeIndex,
  onSelect,
}: {
  days: Day[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (days.length <= 1) return null;
  return (
    <div className="mt-4 flex gap-1 rounded-2xl border border-white/20 bg-white/20 p-1 backdrop-blur-sm">
      {days.map((day, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={day.date}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(i);
            }}
            className={`flex flex-1 items-center justify-center rounded-xl py-2.5 transition-all duration-200 ${
              active
                ? "bg-white text-neutral-900 shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
                : "text-white/70 hover:text-white"
            }`}
          >
            <span className="text-sm font-bold">第 {i + 1} 天</span>
          </button>
        );
      })}
    </div>
  );
}
