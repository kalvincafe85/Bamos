"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Day, TransitBlock } from "@/lib/schema";
import {
  blockForSegment,
  buildDayTimeline,
  editTimelinePoint,
  editTransitMode,
  insertActivityAt,
} from "@/lib/timeline";
import { toDisplayTime } from "@/lib/time";
import { fetchTravelTime } from "@/lib/travelTime";
import Icon from "./Icon";
import TimePickerSheet from "./TimePickerSheet";

const MODES: { value: TransitBlock["mode"]; icon: string; label: string }[] = [
  { value: "car", icon: "directions_car", label: "開車" },
  { value: "transit", icon: "directions_bus", label: "大眾運輸" },
  { value: "walk", icon: "directions_walk", label: "走路" },
];

function bucketOf(time: string): string {
  const hour = Number(time.split(":")[0]);
  if (hour < 12) return "上午";
  if (hour < 18) return "下午";
  return "晚上";
}

export default function DayTimelineSheet({
  day,
  onApply,
  onClose,
}: {
  day: Day;
  onApply: (updatedDay: Day) => void;
  onClose: () => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const points = buildDayTimeline(day);
  const lockedTimes = new Set(day.lockedTimes ?? []);

  function toggleLock(time: string) {
    const next = new Set(lockedTimes);
    if (next.has(time)) next.delete(time);
    else next.add(time);
    onApply({ ...day, lockedTimes: Array.from(next) });
  }

  function changeMode(blockIndex: number, mode: TransitBlock["mode"], minutes: number) {
    const result = editTransitMode(day, blockIndex, mode, minutes, lockedTimes);
    if (result.ok) {
      setModeError(null);
      onApply(result.day);
    } else {
      setModeError(result.error);
    }
  }

  function handleInsert(time: string, title: string) {
    onApply(insertActivityAt(day, time, title, lockedTimes));
  }

  const rows: ReactNode[] = [];
  let lastBucket: string | null = null;

  if (points.length === 0) {
    rows.push(<SectionHeader key="h-empty" label={bucketOf("09:00")} />);
    rows.push(<InsertStrip key="ins-empty" time="09:00" onInsert={(title) => handleInsert("09:00", title)} />);
  }

  for (let i = 0; i < points.length; i++) {
    const bucket = bucketOf(points[i].time);
    if (bucket !== lastBucket) {
      rows.push(<SectionHeader key={`h-${i}`} label={bucket} />);
      lastBucket = bucket;
    }
    rows.push(
      <InsertStrip key={`ins-${i}`} time={points[i].time} onInsert={(title) => handleInsert(points[i].time, title)} />
    );

    if (i < points.length - 1) {
      const point = points[i];
      const next = points[i + 1];
      const segment = blockForSegment(points, i, day.blocks);
      const transitSegment =
        segment && segment.block.type === "transit"
          ? { blockIndex: segment.blockIndex, block: segment.block }
          : null;

      rows.push(
        <div key={`seg-${i}`} className="py-2">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <PinButton active={lockedTimes.has(point.time)} onClick={() => toggleLock(point.time)} />
            <button
              onClick={() => setEditingIndex(i)}
              className="font-bold text-neutral-800 underline decoration-dotted underline-offset-2"
            >
              {toDisplayTime(point.time)}
            </button>
            <span className="text-neutral-500">{point.label}</span>
            <Icon name="arrow_forward" className="text-sm text-neutral-300" />
            <PinButton active={lockedTimes.has(next.time)} onClick={() => toggleLock(next.time)} />
            <button
              onClick={() => setEditingIndex(i + 1)}
              className="font-bold text-neutral-800 underline decoration-dotted underline-offset-2"
            >
              {toDisplayTime(next.time)}
            </button>
            <span className="text-neutral-500">{next.label}</span>
          </div>

          {transitSegment && (
            <TransitModeRow
              block={transitSegment.block}
              onModeChange={(mode, minutes) => changeMode(transitSegment.blockIndex, mode, minutes)}
            />
          )}
        </div>
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[75vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-100 bg-white px-4 py-3">
          <span className="text-sm font-bold text-neutral-800">當天時間總覽</span>
          <button onClick={onClose} className="text-neutral-400">
            <Icon name="close" />
          </button>
        </div>

        <div className="px-4 py-2">{rows}</div>

        {modeError && (
          <div className="flex items-start gap-1.5 border-t border-neutral-100 px-4 py-2 text-xs text-red-500">
            <Icon name="error" className="mt-0.5 shrink-0 text-sm" />
            <span>{modeError}</span>
          </div>
        )}
      </div>

      {editingIndex !== null && (
        <TimePickerSheet
          initialTime={points[editingIndex].time}
          validate={(time) => {
            const result = editTimelinePoint(day, editingIndex, time, lockedTimes);
            return result.ok ? null : result.error;
          }}
          onConfirm={(time) => {
            const result = editTimelinePoint(day, editingIndex, time, lockedTimes);
            if (result.ok) onApply(result.day);
            setEditingIndex(null);
          }}
          onCancel={() => setEditingIndex(null)}
        />
      )}
    </div>
  );
}

const PERIOD_ICON: Record<string, string> = {
  上午: "wb_twilight",
  下午: "wb_sunny",
  晚上: "bedtime",
};

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-1 mt-4 flex items-center gap-1.5 first:mt-1">
      <Icon name={PERIOD_ICON[label]} className="text-base text-neutral-400" />
      <span className="text-xs font-bold tracking-wide text-neutral-400">{label}</span>
      <div className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

// Hover-reveal "insert a new activity here" affordance: a dashed line with a
// centered "+" that only shows on hover, so the timeline stays uncluttered
// until the user goes looking for it. Clicking swaps it for a title input.
function InsertStrip({ time, onInsert }: { time: string; onInsert: (title: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  function confirm() {
    const trimmed = title.trim();
    if (trimmed) onInsert(trimmed);
    setAdding(false);
    setTitle("");
  }

  if (adding) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="w-10 shrink-0 text-right text-[11px] text-neutral-400">{toDisplayTime(time)}</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
            if (e.key === "Escape") {
              setAdding(false);
              setTitle("");
            }
          }}
          onBlur={confirm}
          placeholder="輸入新行程名稱"
          className="flex-1 rounded-lg border border-teal-300 px-2 py-1 text-xs outline-none"
        />
      </div>
    );
  }

  return (
    <div className="group/insert -my-1 flex items-center gap-2 py-1">
      <div className="h-px flex-1 border-t border-dashed border-transparent group-hover/insert:border-neutral-300" />
      <button
        onClick={() => setAdding(true)}
        aria-label="新增行程"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-300 opacity-0 transition-opacity group-hover/insert:bg-teal-50 group-hover/insert:text-teal-600 group-hover/insert:opacity-100"
      >
        <Icon name="add" className="text-sm" />
      </button>
      <div className="h-px flex-1 border-t border-dashed border-transparent group-hover/insert:border-neutral-300" />
    </div>
  );
}

function TransitModeRow({
  block,
  onModeChange,
}: {
  block: TransitBlock;
  onModeChange: (mode: TransitBlock["mode"], minutes: number) => void;
}) {
  const [estimate, setEstimate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTravelTime(block.from, block.to, block.mode).then((minutes) => {
      if (!cancelled) {
        setEstimate(minutes);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [block.from, block.to, block.mode]);

  async function handleSelect(mode: TransitBlock["mode"]) {
    if (mode === block.mode) return;
    setLoading(true);
    const minutes = await fetchTravelTime(block.from, block.to, mode);
    setLoading(false);
    onModeChange(mode, minutes ?? block.minutes);
  }

  return (
    <div className="ml-7 mt-1 flex items-center gap-3 text-xs text-neutral-500">
      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => handleSelect(m.value)}
            aria-label={m.label}
            className={`rounded-lg p-1.5 transition-colors ${
              m.value === block.mode ? "bg-teal-50 text-teal-700" : "text-neutral-400 hover:bg-neutral-50"
            }`}
          >
            <Icon name={m.icon} className="text-base" />
          </button>
        ))}
      </div>
      <span>
        {loading ? (
          "Google 預估中…"
        ) : estimate != null ? (
          `Google 預估 ${estimate} 分鐘${estimate !== block.minutes ? `（目前排 ${block.minutes} 分鐘）` : ""}`
        ) : (
          `預估 ${block.minutes} 分鐘`
        )}
      </span>
    </div>
  );
}

function PinButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={active ? "text-teal-600" : "text-neutral-300"}
      aria-label="鎖定這個時間點"
    >
      <Icon name="push_pin" className="text-base" />
    </button>
  );
}
