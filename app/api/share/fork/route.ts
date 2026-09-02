import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/requireUser";
import type { Itinerary } from "@/lib/schema";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("unauthorized" in auth) return auth.unauthorized;
  const { user } = auth;

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "缺少分享連結" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_itinerary", { p_token: token });
  if (error || !data) {
    return NextResponse.json({ error: "找不到分享的行程" }, { status: 404 });
  }

  const source = data as Itinerary;
  // New id/createdAt so this is a genuinely independent copy, not a reference
  // back to the original owner's itinerary.
  const forked: Itinerary = {
    ...source,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const { error: insertError } = await supabase
    .from("itineraries")
    .insert({ id: forked.id, owner_id: user.id, data: forked });
  if (insertError) {
    return NextResponse.json({ error: "複製行程失敗" }, { status: 500 });
  }

  return NextResponse.json({ id: forked.id });
}
