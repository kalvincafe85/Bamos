import { NextResponse } from "next/server";
import { createClient } from "./server";
import type { User } from "@supabase/supabase-js";

// Call first in any API route that costs money to run (AI generation, map
// lookups, etc.) or that touches per-user data. Returns the authenticated user,
// or a ready-to-return 401 response when there isn't one.
export async function requireUser(): Promise<{ user: User } | { unauthorized: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { unauthorized: NextResponse.json({ error: "請先登入" }, { status: 401 }) };
  }
  return { user };
}
