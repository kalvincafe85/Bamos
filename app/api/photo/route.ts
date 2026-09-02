import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";

// Simple in-memory cache (per server process) to avoid burning Google's free
// 100-query/day quota on repeat lookups of the same place.
const cache = new Map<string, string | null>();

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("unauthorized" in auth) return auth.unauthorized;

  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ url: null });

  if (cache.has(q)) {
    return NextResponse.json({ url: cache.get(q) });
  }

  const url = await searchPhoto(q);
  cache.set(q, url);
  return NextResponse.json({ url });
}

async function searchPhoto(query: string): Promise<string | null> {
  const googleUrl = await searchGoogleCSE(query);
  if (googleUrl) return googleUrl;
  return searchWikimedia(query);
}

// Google Programmable Search Engine (Custom Search JSON API), image mode.
// Free for the first 100 queries/day. Falls through to Wikimedia if not configured
// or if the lookup fails for any reason.
async function searchGoogleCSE(query: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!apiKey || !cx) return null;

  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}` +
        `&q=${encodeURIComponent(query)}&searchType=image&num=1&safe=active`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.items?.[0]?.link ?? null;
  } catch {
    return null;
  }
}

// Free, no-key fallback. Coverage is sparse for small local venues, but useful
// for well-known landmarks.
async function searchWikimedia(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
        `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=1` +
        `&prop=imageinfo&iiprop=url&iiurlwidth=600`
    );
    const data = await res.json();
    const pages = data?.query?.pages as
      | Record<string, { imageinfo?: { thumburl?: string; url?: string }[] }>
      | undefined;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    return page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url ?? null;
  } catch {
    return null;
  }
}
