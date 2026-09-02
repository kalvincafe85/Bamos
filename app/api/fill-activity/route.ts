import { NextRequest, NextResponse } from "next/server";
import { fillActivityDetails } from "@/lib/generate";

export async function POST(req: NextRequest) {
  try {
    const { title, destination, date } = await req.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "請輸入行程標題" }, { status: 400 });
    }

    const details = await fillActivityDetails(
      title,
      typeof destination === "string" ? destination : "",
      typeof date === "string" ? date : ""
    );

    return NextResponse.json({ details });
  } catch (err) {
    console.error("fill-activity error", err);
    return NextResponse.json({ error: "補充行程資訊失敗" }, { status: 500 });
  }
}
