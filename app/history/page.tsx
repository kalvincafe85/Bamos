"use client";

import { useEffect, useState } from "react";
import type { Itinerary } from "@/lib/schema";
import { loadItineraries, splitUpcomingAndPast } from "@/lib/storage";
import ItineraryView from "@/components/ItineraryView";
import Icon from "@/components/Icon";

export default function HistoryPage() {
  const [past, setPast] = useState<Itinerary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const { past } = splitUpcomingAndPast(loadItineraries());
    // Reading localStorage: unavailable during SSR, so this must run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPast(past);
  }, []);

  if (!past.length) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon name="history" className="text-4xl text-neutral-300" />
        <p className="text-sm text-neutral-500">還沒有過往行程</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <h1 className="text-2xl font-bold text-neutral-900">過往行程</h1>
      <div className="mt-4 space-y-2">
        {past.map((it) => {
          const expanded = expandedId === it.id;
          const range = formatRange(it.days[0]?.date, it.days[it.days.length - 1]?.date);
          return (
            <div key={it.id} className="overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm">
              <button
                onClick={() => setExpandedId(expanded ? null : it.id)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left"
              >
                <div>
                  <div className="font-semibold text-neutral-800">{it.title}</div>
                  <div className="text-xs text-neutral-400">{range}</div>
                </div>
                <Icon
                  name="expand_more"
                  className={`text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
              {expanded && (
                <div className="border-t border-neutral-100">
                  <ItineraryView itinerary={it} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRange(start?: string, end?: string): string {
  if (!start) return "";
  const s = start.slice(0, 10);
  const e = end?.slice(0, 10) ?? s;
  return s === e ? s : `${s} ~ ${e}`;
}
