"use client";

import type { Itinerary } from "./schema";
import { createClient } from "./supabase/client";

export async function loadItineraries(): Promise<Itinerary[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("itineraries").select("data");
  if (error || !data) return [];
  return data.map((row) => row.data as Itinerary);
}

export async function saveItinerary(itinerary: Itinerary): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("itineraries").upsert({
    id: itinerary.id,
    owner_id: user.id,
    data: itinerary,
    updated_at: new Date().toISOString(),
  });
}

export async function getItinerary(id: string): Promise<Itinerary | undefined> {
  const supabase = createClient();
  const { data } = await supabase.from("itineraries").select("data").eq("id", id).maybeSingle();
  return (data?.data as Itinerary | undefined) ?? undefined;
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
