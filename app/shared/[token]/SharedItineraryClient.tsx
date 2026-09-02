"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Itinerary } from "@/lib/schema";
import { createClient } from "@/lib/supabase/client";
import ItineraryView from "@/components/ItineraryView";
import Icon from "@/components/Icon";

export default function SharedItineraryClient({ token }: { token: string }) {
  const router = useRouter();
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notFound">("loading");
  const [forking, setForking] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("get_shared_itinerary", { p_token: token }).then(({ data, error }) => {
      if (error || !data) {
        setStatus("notFound");
        return;
      }
      setItinerary(data as Itinerary);
      setStatus("ready");
    });
  }, [token]);

  async function handleCopy() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/shared/${token}` },
      });
      return;
    }

    setForking(true);
    const res = await fetch("/api/share/fork", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setForking(false);
    if (res.ok) router.push("/upcoming");
  }

  if (status === "loading") {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3">
        <Icon name="progress_activity" className="animate-spin text-3xl text-teal-600" />
      </div>
    );
  }

  if (status === "notFound" || !itinerary) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon name="link_off" className="text-4xl text-neutral-300" />
        <p className="text-sm text-neutral-500">找不到這個分享連結</p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <ItineraryView itinerary={itinerary} />
      <div className="fixed inset-x-0 bottom-20 z-40 px-4">
        <button
          onClick={handleCopy}
          disabled={forking}
          className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3.5 text-center font-semibold text-white shadow-lg disabled:opacity-60"
        >
          <Icon
            name={forking ? "progress_activity" : "content_copy"}
            className={forking ? "animate-spin text-lg" : "text-lg"}
          />
          複製到我的行程
        </button>
      </div>
    </div>
  );
}
