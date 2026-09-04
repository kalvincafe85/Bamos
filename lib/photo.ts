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

// Best-effort "lat,lng" extraction from a pasted Google Maps URL (covers the
// common share-link shapes) so a directions link can use exact coordinates
// instead of re-searching by name. Falls back to the URL itself when no known
// pattern matches — still usable as a destination/origin query, just less precise.
export function googleMapsQueryFromUrl(url: string): string {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // .../@25.033,121.565,17z
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // place-detail pin
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?q=25.033,121.565
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
