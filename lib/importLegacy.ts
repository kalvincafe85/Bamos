"use client";

import type { Itinerary } from "./schema";
import { saveItinerary } from "./storage";

const LEGACY_KEY = "bamos.itineraries";
const IMPORTED_FLAG_KEY = "bamos.importedToCloud";

// One-time migration: the app used to store itineraries only in this browser's
// localStorage. After a user's first real login, copy anything sitting there
// into their new Supabase account, then clear it so it isn't re-imported or
// mistaken for current data.
export async function importLegacyItinerariesIfNeeded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(IMPORTED_FLAG_KEY)) return;

  const raw = window.localStorage.getItem(LEGACY_KEY);
  window.localStorage.setItem(IMPORTED_FLAG_KEY, "1");
  if (!raw) return;

  try {
    const itineraries = JSON.parse(raw) as Itinerary[];
    for (const itinerary of itineraries) {
      await saveItinerary(itinerary);
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Malformed local data — nothing worth importing, leave the flag set so we
    // don't keep retrying on every login.
  }
}
