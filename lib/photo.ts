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

export function googleMapsDirectionsUrl(destinationQuery: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destinationQuery
  )}&travelmode=driving`;
}
