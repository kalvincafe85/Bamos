"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadItineraries, saveItinerary, splitUpcomingAndPast } from "@/lib/storage";
import type { Itinerary } from "@/lib/schema";
import TripTabs from "@/components/TripTabs";
import ItineraryView from "@/components/ItineraryView";
import Icon from "@/components/Icon";

const PENDING_TEXT_KEY = "bamos.pendingText";
const PENDING_ID_KEY = "bamos.pendingId";
const PENDING_HOME_ADDRESS_KEY = "bamos.pendingHomeAddress";
const ESTIMATED_SECONDS = 50;

export default function UpcomingPage() {
  return (
    <Suspense>
      <UpcomingPageInner />
    </Suspense>
  );
}

function UpcomingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const generatingId = searchParams.get("generating");

  const [upcoming, setUpcoming] = useState<Itinerary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "error">(
    generatingId ? "generating" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ESTIMATED_SECONDS);

  function refresh(preferId?: string) {
    const { upcoming } = splitUpcomingAndPast(loadItineraries());
    setUpcoming(upcoming);
    if (preferId) setSelectedId(preferId);
    else if (!selectedId && upcoming.length) setSelectedId(upcoming[0].id);
  }

  useEffect(() => {
    // Reading localStorage: unavailable during SSR, so this must run post-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
    refresh();
  }, []);

  useEffect(() => {
    if (status !== "generating") return;

    const pendingText = window.sessionStorage.getItem(PENDING_TEXT_KEY);
    const pendingId = window.sessionStorage.getItem(PENDING_ID_KEY);
    const pendingHomeAddress = window.sessionStorage.getItem(PENDING_HOME_ADDRESS_KEY) ?? "";
    if (!pendingText || pendingId !== generatingId) {
      router.replace("/upcoming");
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 1 ? s - 1 : 1));
    }, 1000);

    // Guard against React (StrictMode) double-invoking this effect in dev, which
    // would otherwise fire two concurrent generate requests for the same submit.
    const controller = new AbortController();

    fetch("/api/generate-itinerary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pendingText, homeAddress: pendingHomeAddress }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "生成失敗");
        saveItinerary(data.itinerary as Itinerary);
        window.sessionStorage.removeItem(PENDING_TEXT_KEY);
        window.sessionStorage.removeItem(PENDING_ID_KEY);
        window.sessionStorage.removeItem(PENDING_HOME_ADDRESS_KEY);
        clearInterval(timer);
        setStatus("idle");
        refresh(data.itinerary.id);
        router.replace("/upcoming");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        clearInterval(timer);
        setStatus("error");
        setError(err.message ?? "行程生成失敗");
      });

    return () => {
      clearInterval(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, generatingId]);

  if (status === "generating") {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <Icon name="progress_activity" className="animate-spin text-4xl text-teal-600" />
        <p className="text-lg font-semibold text-neutral-800">AI 規劃中...</p>
        <p className="text-sm text-neutral-500">
          {secondsLeft > 3 ? `剩餘 ${mins} 分 ${secs} 秒` : "即將完成，請再稍候..."}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon name="error" className="text-4xl text-red-500" />
        <p className="text-sm text-neutral-600">{error}</p>
        <Link href="/create" className="mt-2 rounded-full bg-teal-600 px-5 py-2 text-sm font-medium text-white">
          重新輸入
        </Link>
      </div>
    );
  }

  if (!upcoming.length) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon name="flight_takeoff" className="text-4xl text-neutral-300" />
        <p className="text-sm text-neutral-500">還沒有即將出發的行程</p>
        <Link href="/create" className="mt-2 rounded-full bg-teal-600 px-5 py-2 text-sm font-medium text-white">
          建立第一個行程
        </Link>
      </div>
    );
  }

  const selected = upcoming.find((i) => i.id === selectedId) ?? upcoming[0];

  return (
    <div>
      <TripTabs itineraries={upcoming} activeId={selected.id} onSelect={setSelectedId} />
      <ItineraryView
        itinerary={selected}
        editable
        viewMode="calendar"
        onItineraryChange={(updated) => {
          saveItinerary(updated);
          refresh(updated.id);
        }}
      />
    </div>
  );
}
