import type { Itinerary } from "@/lib/schema";

export default function TripTabs({
  itineraries,
  activeId,
  onSelect,
}: {
  itineraries: Itinerary[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (itineraries.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3 pt-3">
      {itineraries.map((it) => (
        <button
          key={it.id}
          onClick={() => onSelect(it.id)}
          className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            it.id === activeId
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400"
          }`}
        >
          {it.title}
        </button>
      ))}
    </div>
  );
}
