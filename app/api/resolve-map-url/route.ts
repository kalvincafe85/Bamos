import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";

// Google Maps share links from the mobile app default to a short goo.gl link
// with no readable location in it — this follows the redirect chain server-side
// (browsers can't do this cross-origin from a plain fetch) so the real URL
// (which does contain coordinates) can be extracted from it.
const ALLOWED_HOSTS = ["goo.gl", "maps.app.goo.gl", "google.com", "www.google.com", "maps.google.com"];

function isAllowedMapsUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("unauthorized" in auth) return auth.unauthorized;

  const url = req.nextUrl.searchParams.get("url");
  if (!url || !isAllowedMapsUrl(url)) {
    return NextResponse.json({ resolved: null }, { status: 400 });
  }

  try {
    const res = await fetch(url, { redirect: "follow" });
    return NextResponse.json({ resolved: res.url });
  } catch {
    return NextResponse.json({ resolved: null });
  }
}
