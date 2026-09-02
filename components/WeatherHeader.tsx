"use client";

import { useState } from "react";
import type { DailyWeather } from "@/lib/weather";
import Icon from "./Icon";
import PhotoEditSheet from "./PhotoEditSheet";
import { sourceSans } from "@/lib/fonts";

export default function WeatherHeader({
  title,
  destination,
  startDate,
  endDate,
  weather,
  editable = false,
  coverPhoto,
  coverPhotoOffsetY,
  onTitleChange,
  onCoverPhotoChange,
  onStartDateChange,
  children,
}: {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  weather?: DailyWeather;
  editable?: boolean;
  coverPhoto?: string;
  coverPhotoOffsetY?: number;
  onTitleChange?: (title: string) => void;
  onCoverPhotoChange?: (url: string | undefined, offsetY: number | undefined) => void;
  onStartDateChange?: (newStartDate: string) => void;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [editingDate, setEditingDate] = useState(false);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onTitleChange?.(trimmed);
    else setDraft(title);
  }

  return (
    <div className="relative overflow-hidden">
      <div
        onClick={editable ? () => setEditingPhoto(true) : undefined}
        className={`relative block w-full text-left ${editable ? "cursor-pointer" : ""}`}
      >
        <div className="absolute inset-0 bg-neutral-900">
          {coverPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverPhoto}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: `center ${coverPhotoOffsetY ?? 50}%` }}
            />
          )}
        </div>
        <div className="absolute inset-0 bg-[#0a3569] opacity-35" />

        <div className="relative px-5 pb-6 pt-6 text-white">
          <span className="inline-block rounded-full bg-[#1BA1E8] px-3 py-1 text-xs font-semibold text-white">
            {destination}
          </span>

          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commit}
                  onKeyDown={(e) => e.key === "Enter" && commit()}
                  className="w-full rounded-lg bg-white/10 px-2 py-1 text-4xl font-bold outline-none ring-1 ring-white/30"
                />
              ) : (
                <h1
                  onClick={(e) => {
                    if (!editable) return;
                    e.stopPropagation();
                    setEditing(true);
                  }}
                  className={`text-4xl font-bold leading-tight ${editable ? "cursor-text" : ""}`}
                >
                  {title}
                </h1>
              )}
              {editingDate ? (
                <input
                  type="date"
                  autoFocus
                  defaultValue={startDate}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setEditingDate(false);
                    if (e.target.value && e.target.value !== startDate) onStartDateChange?.(e.target.value);
                  }}
                  className="mt-1.5 rounded-lg bg-white/10 px-2 py-1 text-[20px] font-bold text-white outline-none ring-1 ring-white/30"
                />
              ) : (
                <p
                  onClick={(e) => {
                    if (!editable || !onStartDateChange) return;
                    e.stopPropagation();
                    setEditingDate(true);
                  }}
                  className={`mt-1.5 text-[20px] font-bold text-white/90 ${sourceSans.className} ${
                    editable && onStartDateChange ? "cursor-pointer" : ""
                  }`}
                >
                  {formatRange(startDate, endDate)}
                </p>
              )}
            </div>

            {weather && (
              <div className="flex shrink-0 items-center gap-2">
                <Icon name={weather.precipChance >= 40 ? "rainy" : "wb_cloudy"} className="text-7xl text-white" />
                <div className={`flex flex-col gap-1 text-xl font-bold text-white ${sourceSans.className}`}>
                  <span className="flex items-center gap-1.5">
                    <Icon name="water_drop" className="text-2xl" />
                    {weather.precipChance}%
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="thermostat" className="text-2xl" />
                    {weather.tempC}°
                  </span>
                </div>
              </div>
            )}
          </div>

          {children && (
            <div onClick={(e) => e.stopPropagation()}>{children}</div>
          )}
        </div>
      </div>

      {editingPhoto && (
        <PhotoEditSheet
          currentUrl={coverPhoto ?? null}
          currentOffsetY={coverPhotoOffsetY ?? 50}
          hasOverride={!!coverPhoto}
          onApply={(url, offsetY) => {
            onCoverPhotoChange?.(url, offsetY);
            setEditingPhoto(false);
          }}
          onReset={() => {
            onCoverPhotoChange?.(undefined, undefined);
            setEditingPhoto(false);
          }}
          onClose={() => setEditingPhoto(false)}
        />
      )}
    </div>
  );
}

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSingle(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1} / ${d.getDate()} ${WEEKDAY_ABBR[d.getDay()]}.`;
}

function formatRange(start: string, end: string): string {
  const s = formatSingle(start);
  const e = formatSingle(end);
  return start === end ? s : `${s}  -  ${e}`;
}
