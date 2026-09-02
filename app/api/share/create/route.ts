import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("unauthorized" in auth) return auth.unauthorized;
  const { user } = auth;

  const { itineraryId } = await req.json();
  if (!itineraryId || typeof itineraryId !== "string") {
    return NextResponse.json({ error: "缺少行程 ID" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("shares")
    .select("token")
    .eq("itinerary_id", itineraryId)
    .maybeSingle();

  let token = existing?.token as string | undefined;

  if (!token) {
    const { data: created, error } = await supabase
      .from("shares")
      .insert({ itinerary_id: itineraryId, created_by: user.id })
      .select("token")
      .single();

    if (error || !created) {
      // Possibly a race on the unique(itinerary_id) constraint — re-check once.
      const { data: retry } = await supabase
        .from("shares")
        .select("token")
        .eq("itinerary_id", itineraryId)
        .maybeSingle();
      if (!retry) return NextResponse.json({ error: "分享連結建立失敗" }, { status: 500 });
      token = retry.token as string;
    } else {
      token = created.token as string;
    }
  }

  return NextResponse.json({ token, url: `${req.nextUrl.origin}/shared/${token}` });
}
