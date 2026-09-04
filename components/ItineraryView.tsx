"use client";

import { useEffect, useState } from "react";
import type { Itinerary, Day } from "@/lib/schema";
import { fetchWeatherForDestination, type DailyWeather } from "@/lib/weather";
import { isoDateDiffDays, addDaysToISODate } from "@/lib/time";
import DayTabs from "./DayTabs";
import WeatherHeader from "./WeatherHeader";
import ActivityCard from "./ActivityCard";
import TransitRow from "./TransitRow";
import BackupSection from "./BackupSection";
import DayTimelineSheet from "./DayTimelineSheet";
import CalendarDayView from "./CalendarDayView";
import WeekCalendarView from "./WeekCalendarView";
import Icon from "./Icon";

export default function ItineraryView({
  itinerary,
  editable = false,
  viewMode = "list",
  onItineraryChange,
}: {
  itinerary: Itinerary;
  editable?: boolean;
  viewMode?: "list" | "calendar";
  onItineraryChange?: (updated: Itinerary) => void;
}) {
  const [activeDay, setActiveDay] = useState(0);
  const [weatherByDate, setWeatherByDate] = useState<Record<string, DailyWeather>>({});
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [weekViewOpen, setWeekViewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleShare() {
    try {
      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itineraryId: itinerary.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "分享連結建立失敗");
      await navigator.clipboard.writeText(data.url as string);
      setToast("已複製連結");
    } catch {
      setToast("分享連結建立失敗");
    }
  }

  useEffect(() => {
    const dates = itinerary.days.map((d) => d.date);
    fetchWeatherForDestination(itinerary.destination, dates).then((results) => {
      const map: Record<string, DailyWeather> = {};
      for (const w of results) map[w.date] = w;
      setWeatherByDate(map);
    });
  }, [itinerary.destination, itinerary.days]);

  const day = itinerary.days[activeDay];
  const startDate = itinerary.days[0]?.date ?? "";
  const endDate = itinerary.days[itinerary.days.length - 1]?.date ?? "";

  function updateDay(updatedDay: Day) {
    const days = [...itinerary.days];
    days[activeDay] = updatedDay;
    onItineraryChange?.({ ...itinerary, days });
  }

  function updateBlockPhoto(blockIndex: number, url: string | undefined, offsetY: number | undefined) {
    const blocks = [...day.blocks];
    blocks[blockIndex] = {
      ...blocks[blockIndex],
      photoOverride: url,
      photoOffsetY: offsetY,
    } as (typeof blocks)[number];
    updateDay({ ...day, blocks });
  }

  function handleStartDateChange(newStartDate: string) {
    const offsetDays = isoDateDiffDays(newStartDate, startDate);
    const days = itinerary.days.map((d) => ({ ...d, date: addDaysToISODate(d.date, offsetDays) }));
    onItineraryChange?.({ ...itinerary, days });
  }

  function updateCoverPhoto(url: string | undefined, offsetY: number | undefined) {
    onItineraryChange?.({ ...itinerary, coverPhoto: url, coverPhotoOffsetY: offsetY });
  }

  return (
    <div>
      <WeatherHeader
        title={itinerary.title}
        destination={itinerary.destination}
        startDate={startDate}
        endDate={endDate}
        weather={weatherByDate[day?.date]}
        editable={editable}
        coverPhoto={itinerary.coverPhoto}
        coverPhotoOffsetY={itinerary.coverPhotoOffsetY}
        onTitleChange={(title) => onItineraryChange?.({ ...itinerary, title })}
        onCoverPhotoChange={updateCoverPhoto}
        onStartDateChange={handleStartDateChange}
      >
        <DayTabs days={itinerary.days} activeIndex={activeDay} onSelect={setActiveDay} />
      </WeatherHeader>

      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ width: "200%", transform: `translateX(${weekViewOpen ? "-50%" : "0%"})` }}
        >
          <div className="w-1/2 shrink-0">
            {viewMode === "calendar" ? (
              day && (
                <CalendarDayView
                  day={day}
                  editable={editable}
                  onDayChange={updateDay}
                  onOpenWeekView={
                    editable && onItineraryChange ? () => setWeekViewOpen(true) : undefined
                  }
                  onShare={handleShare}
                  destination={itinerary.destination}
                  isFirstDay={activeDay === 0}
                  isLastDay={activeDay === itinerary.days.length - 1}
                />
              )
            ) : (
              <>
                <div className="mb-1 flex justify-end gap-2 px-4 pt-4">
                  <button
                    onClick={handleShare}
                    aria-label="分享行程"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    <Icon name="ios_share" className="text-xl" />
                  </button>
                </div>
                {editable && day && (
                  <div className="px-4">
                    <button
                      onClick={() => setTimelineOpen(true)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal-300 bg-teal-50 py-2.5 text-sm font-semibold text-teal-700"
                    >
                      <Icon name="edit_calendar" className="text-base" />
                      修改行程
                    </button>
                  </div>
                )}

                <div className="space-y-3 px-4">
                  {day?.blocks.map((block, i) =>
                    block.type === "activity" ? (
                      <ActivityCard
                        key={i}
                        block={block}
                        editable={editable}
                        onTimeClick={() => setTimelineOpen(true)}
                        onPhotoChange={(url, offsetY) => updateBlockPhoto(i, url, offsetY)}
                      />
                    ) : (
                      <TransitRow
                        key={i}
                        block={block}
                        editable={editable}
                        onTimeClick={() => setTimelineOpen(true)}
                      />
                    )
                  )}
                </div>

                {timelineOpen && day && (
                  <DayTimelineSheet day={day} onApply={updateDay} onClose={() => setTimelineOpen(false)} />
                )}
              </>
            )}

            <BackupSection plans={itinerary.backupPlans} />
          </div>

          <div className="w-1/2 shrink-0 px-4 pt-4">
            {editable && (
              <div className="mb-2 flex justify-end gap-2">
                <button
                  onClick={() => setWeekViewOpen(false)}
                  aria-label="返回行程列表"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <Icon name="view_agenda" className="text-xl" />
                </button>
                <button
                  onClick={handleShare}
                  aria-label="分享行程"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <Icon name="ios_share" className="text-xl" />
                </button>
                <button
                  disabled
                  aria-label="全部收合（僅日檢視可用）"
                  className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600"
                >
                  <Icon name="unfold_less" className="text-xl" />
                </button>
                <button
                  disabled
                  aria-label="新增行程（僅日檢視可用）"
                  className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600"
                >
                  <Icon name="add" className="text-xl" />
                </button>
                <button
                  disabled
                  aria-label="編輯（僅日檢視可用）"
                  className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600"
                >
                  <Icon name="edit" className="text-xl" />
                </button>
              </div>
            )}
            {onItineraryChange && <WeekCalendarView itinerary={itinerary} onItineraryChange={onItineraryChange} />}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="rounded-full bg-neutral-900/90 px-4 py-2 text-sm text-white shadow-lg dark:bg-neutral-100/90 dark:text-neutral-900">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
