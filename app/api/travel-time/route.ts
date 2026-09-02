import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache (per server process) to avoid burning quota on repeat
// lookups of the same origin/destination/mode combo.
const cache = new Map<string, number | null>();

const MODE_MAP = { car: "driving", walk: "walking", transit: "transit" } as const;

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const mode = req.nextUrl.searchParams.get("mode") as keyof typeof MODE_MAP | null;
  if (!from || !to || !mode || !(mode in MODE_MAP)) {
    return NextResponse.json({ minutes: null });
  }

  const cacheKey = `${from}|${to}|${mode}`;
  if (cache.has(cacheKey)) {
    return NextResponse.json({ minutes: cache.get(cacheKey) });
  }

  const minutes = await fetchGoogleTravelTime(from, to, MODE_MAP[mode]);
  cache.set(cacheKey, minutes);
  return NextResponse.json({ minutes });
}

// Google Distance Matrix API. Requires GOOGLE_MAPS_API_KEY (and billing enabled
// on the project). Returns null if not configured or the lookup fails for any
// reason — callers should treat that as "estimate unavailable", not an error.
async function fetchGoogleTravelTime(
  origin: string,
  destination: string,
  mode: "driving" | "walking" | "transit"
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?` +
        `origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}` +
        `&mode=${mode}&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const element = data?.rows?.[0]?.elements?.[0];
    if (element?.status !== "OK") return null;
    const seconds = element?.duration?.value;
    return typeof seconds === "number" ? Math.round(seconds / 60) : null;
  } catch {
    return null;
  }
}
