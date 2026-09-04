// Delegates to our own /api/photo route (Google Custom Search when configured,
// Wikimedia Commons as a free fallback) — keeps any API keys server-side.
export async function fetchPhotoUrl(query: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/photo?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return data?.url ?? null;
  } catch {
    return null;
  }
}

// Google Maps' mobile share sheet defaults to a goo.gl short link, which has
// no readable location in it — resolve it server-side to the real URL (which
// does) before it's stored, so downstream lat/lng extraction actually works.
// Non-short-link input is returned unchanged.
export async function resolveMapShortLink(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const { hostname } = new URL(trimmed);
    if (!hostname.endsWith("goo.gl")) return trimmed;
  } catch {
    return trimmed;
  }
  try {
    const res = await fetch(`/api/resolve-map-url?url=${encodeURIComponent(trimmed)}`);
    const data = await res.json();
    return (data?.resolved as string | undefined) || trimmed;
  } catch {
    return trimmed;
  }
}

// Best-effort "lat,lng" extraction from a pasted Google Maps URL (covers the
// common share-link shapes) so a directions link can use exact coordinates
// instead of re-searching by name. Falls back to the URL itself when no known
// pattern matches — still usable as a destination/origin query, just less precise.
export function googleMapsQueryFromUrl(url: string): string {
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // place-detail pin — most precise, prefer first
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?q=25.033,121.565
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // .../@25.033,121.565,17z — viewport center, less precise
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `${match[1]},${match[2]}`;
  }
  return url;
}

export function googleMapsDirectionsUrl(destinationQuery: string, originQuery?: string): string {
  const params = new URLSearchParams({ api: "1", destination: destinationQuery, travelmode: "driving" });
  if (originQuery) params.set("origin", originQuery);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
