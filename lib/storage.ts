"use client";

import type { Itinerary } from "./schema";

const STORAGE_KEY = "bamos.itineraries";
const LEGACY_STORAGE_KEY = "routecraft.itineraries";

export function loadItineraries(): Itinerary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Itinerary[];
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as Itinerary[];
    window.localStorage.setItem(STORAGE_KEY, legacyRaw);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacy;
  } catch {
    return [];
  }
}

export function saveItinerary(itinerary: Itinerary): void {
  const all = loadItineraries();
  const idx = all.findIndex((i) => i.id === itinerary.id);
  if (idx >= 0) {
    all[idx] = itinerary;
  } else {
    all.push(itinerary);
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getItinerary(id: string): Itinerary | undefined {
  return loadItineraries().find((i) => i.id === id);
}

function lastDate(itinerary: Itinerary): string {
  return itinerary.days[itinerary.days.length - 1]?.date ?? itinerary.createdAt;
}

export function splitUpcomingAndPast(itineraries: Itinerary[]): {
  upcoming: Itinerary[];
  past: Itinerary[];
} {
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming: Itinerary[] = [];
  const past: Itinerary[] = [];
  for (const it of itineraries) {
    if (lastDate(it) >= todayStr) upcoming.push(it);
    else past.push(it);
  }
  upcoming.sort((a, b) => (a.days[0]?.date ?? "").localeCompare(b.days[0]?.date ?? ""));
  past.sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
  return { upcoming, past };
}
