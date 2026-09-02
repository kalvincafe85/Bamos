import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginScreen from "@/components/LoginScreen";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/upcoming");

  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
