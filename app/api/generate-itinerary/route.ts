import { NextRequest, NextResponse } from "next/server";
import { generateItineraryDraft } from "@/lib/generate";
import type { Itinerary } from "@/lib/schema";
import { requireUser } from "@/lib/supabase/requireUser";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("unauthorized" in auth) return auth.unauthorized;

  try {
    const { text, homeAddress, destination, startDate } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "請輸入行程內容" }, { status: 400 });
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    const draft = await generateItineraryDraft(text, todayISO, {
      homeAddress: typeof homeAddress === "string" ? homeAddress : "",
      destination: typeof destination === "string" ? destination : "",
      startDate: typeof startDate === "string" ? startDate : "",
    });

    const itinerary: Itinerary = {
      id: crypto.randomUUID(),
      title: draft.title,
      createdAt: new Date().toISOString(),
      destination: draft.destination,
      days: draft.days,
      backupPlans: draft.backupPlans,
    };

    return NextResponse.json({ itinerary });
  } catch (err) {
    console.error("generate-itinerary error", err);
    return NextResponse.json(
      { error: "行程生成失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
