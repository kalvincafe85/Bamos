import type { TransitBlock } from "./schema";

// Delegates to our own /api/travel-time route (Google Distance Matrix when
// configured) — keeps the API key server-side. Returns null if unavailable.
export async function fetchTravelTime(
  from: string,
  to: string,
  mode: TransitBlock["mode"]
): Promise<number | null> {
  try {
    const res = await fetch(
      `/api/travel-time?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=${mode}`
    );
    const data = await res.json();
    return data?.minutes ?? null;
  } catch {
    return null;
  }
}

// Delegates to /api/travel-time-ai (Claude-estimated, mode-aware) — used by
// the week view's transit mode picker, which supports modes (機車/腳踏車)
// Google's Distance Matrix API doesn't natively estimate. Returns null if
// unavailable.
export async function estimateTravelTimeAI(
  from: string,
  to: string,
  mode: TransitBlock["mode"]
): Promise<number | null> {
  try {
    const res = await fetch("/api/travel-time-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, mode }),
    });
    const data = await res.json();
    return data?.minutes ?? null;
  } catch {
    return null;
  }
}
