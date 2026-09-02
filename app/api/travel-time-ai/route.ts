import { NextRequest, NextResponse } from "next/server";
import { estimateTravelMinutes } from "@/lib/generate";

export async function POST(req: NextRequest) {
  try {
    const { from, to, mode } = await req.json();
    if (!from || !to || !mode) {
      return NextResponse.json({ error: "缺少起點、終點或交通方式" }, { status: 400 });
    }

    const minutes = await estimateTravelMinutes(from, to, mode);
    return NextResponse.json({ minutes });
  } catch (err) {
    console.error("travel-time-ai error", err);
    return NextResponse.json({ error: "估算通勤時間失敗" }, { status: 500 });
  }
}
