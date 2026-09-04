"use client";

import { useEffect, useState } from "react";
import type { Itinerary } from "@/lib/schema";
import { createClient } from "@/lib/supabase/client";
import ItineraryView from "@/components/ItineraryView";
import Icon from "@/components/Icon";

// "複製到我的行程" is temporarily disabled — shared itineraries are view-only
// for now. The fork endpoint (/api/share/fork) is untouched; re-add a button
// that POSTs to it (see git history for the previous version) to turn this
// back on.
export default function SharedItineraryClient({ token }: { token: string }) {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notFound">("loading");

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
    <div>
      <ItineraryView itinerary={itinerary} />
    </div>
  );
}
