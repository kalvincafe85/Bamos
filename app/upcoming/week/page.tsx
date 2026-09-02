"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Itinerary } from "@/lib/schema";
import { getItinerary, saveItinerary } from "@/lib/storage";
import WeekCalendarView from "@/components/WeekCalendarView";
import Icon from "@/components/Icon";

export default function WeekViewPage() {
  return (
    <Suspense>
      <WeekViewPageInner />
    </Suspense>
  );
}

function WeekViewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);

  useEffect(() => {
    if (!id) return;
    // Reading localStorage: unavailable during SSR, so this must run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItinerary(getItinerary(id) ?? null);
  }, [id]);

  function handleChange(updated: Itinerary) {
    setItinerary(updated);
    saveItinerary(updated);
  }

  if (!itinerary) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon name="calendar_month" className="text-4xl text-neutral-300" />
        <p className="text-sm text-neutral-500">找不到這個行程</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => router.back()}
          aria-label="返回"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          <Icon name="arrow_back" className="text-xl" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-neutral-900 dark:text-neutral-100">
          {itinerary.title}
        </h1>
      </div>
      <WeekCalendarView itinerary={itinerary} onItineraryChange={handleChange} />
    </div>
  );
}
