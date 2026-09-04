"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ActivityBlock, Itinerary, Day, TransitBlock } from "@/lib/schema";
import { blockTimeRange, moveBlockBy, resizeBlockEdge } from "@/lib/timeline";
import { toDisplayTime, toHHMM, roundUpToQuarterHour } from "@/lib/time";
import { estimateTravelTimeAI } from "@/lib/travelTime";
import Icon from "./Icon";

const TRANSIT_MODES: { value: TransitBlock["mode"]; icon: string; label: string }[] = [
  { value: "transit", icon: "directions_bus", label: "大眾運輸" },
  { value: "walk", icon: "directions_walk", label: "走路" },
  { value: "car", icon: "directions_car", label: "開車" },
  { value: "scooter", icon: "two_wheeler", label: "騎機車" },
  { value: "bicycle", icon: "directions_bike", label: "腳踏車" },
];

const PX_PER_MIN = 1.5;
const DAY_MINUTES = 1440;
const SNAP_MIN = 15;
const MIN_BLOCK_HEIGHT = 36;

const WEEKDAY_ABBR = ["日", "一", "二", "三", "四", "五", "六"];

// Reuses ActivityCard's category palette (brand 藍/橘/綠) so blocks read as
// soft tinted chips — consistent with the rest of the app — instead of flat
// solid fills.
const CATEGORY_BLOCK_CLASS: Record<ActivityBlock["category"], string> = {
  attraction: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200",
  meal: "border-[#F0930A]/30 bg-[#F0930A]/10 text-[#8a5806] dark:border-[#F0930A]/40 dark:bg-[#F0930A]/15 dark:text-[#F0930A]",
  lodging: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200",
  other: "border-[#1BA1E8]/30 bg-[#1BA1E8]/10 text-[#0d5c85] dark:border-[#1BA1E8]/40 dark:bg-[#1BA1E8]/15 dark:text-[#1BA1E8]",
};
const TRANSIT_BLOCK_CLASS =
  "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400";

function formatColumnDate(iso: string): { day: number; weekday: string } {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return { day: 0, weekday: iso };
  return { day: d.getDate(), weekday: WEEKDAY_ABBR[d.getDay()] };
}

function isToday(iso: string): boolean {
  return iso === new Date().toISOString().slice(0, 10);
}

function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function transitModeInfo(mode: TransitBlock["mode"]) {
  return TRANSIT_MODES.find((m) => m.value === mode) ?? TRANSIT_MODES[2];
}

function keyOf(dayIndex: number, blockIndex: number): string {
  return `${dayIndex}-${blockIndex}`;
}

function rectsIntersect(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

type DragState = {
  mode: "move" | "resize-start" | "resize-end";
  dayIndex: number;
  blockIndex: number;
  startClientY: number;
  originDay: Day;
};

export default function WeekCalendarView({
  itinerary,
  onItineraryChange,
}: {
  itinerary: Itinerary;
  onItineraryChange: (updated: Itinerary) => void;
}) {
  const dragRef = useRef<DragState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [modePopover, setModePopover] = useState<{ dayIndex: number; blockIndex: number } | null>(null);
  const [estimatingKey, setEstimatingKey] = useState<string | null>(null);

  // Multi-select: mouse drags a rubber-band box over blocks; touch long-press
  // arms select mode, then dragging your finger over other blocks adds them.
  const blockElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [boxSelect, setBoxSelect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(
    null
  );
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchSelectingRef = useRef(false);

  function updateSelectionFromBox(box: { startX: number; startY: number; endX: number; endY: number }) {
    const rect = {
      left: Math.min(box.startX, box.endX),
      right: Math.max(box.startX, box.endX),
      top: Math.min(box.startY, box.endY),
      bottom: Math.max(box.startY, box.endY),
    };
    const next = new Set<string>();
    blockElsRef.current.forEach((el, key) => {
      if (rectsIntersect(el.getBoundingClientRect(), rect)) next.add(key);
    });
    setSelected(next);
  }

  function deleteSelected() {
    const days = itinerary.days.map((day, dayIndex) => ({
      ...day,
      blocks: day.blocks.filter((_, blockIndex) => !selected.has(keyOf(dayIndex, blockIndex))),
    }));
    onItineraryChange({ ...itinerary, days });
    setSelected(new Set());
  }

  function shiftSelected(deltaMinutes: number) {
    const days = itinerary.days.map((day, dayIndex) => {
      const blocks = day.blocks.map((block, blockIndex) => {
        if (!selected.has(keyOf(dayIndex, blockIndex))) return block;
        const { startMin, endMin } = blockTimeRange(block);
        const duration = endMin - startMin;
        const newStart = Math.max(0, Math.min(DAY_MINUTES - duration, startMin + deltaMinutes));
        const newEnd = newStart + duration;
        return block.type === "activity"
          ? { ...block, start: toHHMM(newStart), end: toHHMM(newEnd) }
          : { ...block, departure: toHHMM(newStart), arrival: toHHMM(newEnd) };
      });
      return { ...day, blocks };
    });
    onItineraryChange({ ...itinerary, days });
  }

  useEffect(() => {
    if (!modePopover) return;
    function handlePointerDown(e: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setModePopover(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [modePopover]);

  const earliestMin = itinerary.days.some((d) => d.blocks.length)
    ? Math.min(...itinerary.days.flatMap((d) => d.blocks.map((b) => blockTimeRange(b).startMin)))
    : 8 * 60;
  const visibleStart = Math.max(0, Math.floor(earliestMin / 60) * 60);
  const gridHeight = Math.max((DAY_MINUTES - visibleStart) * PX_PER_MIN, 200);

  const hourTicks: number[] = [];
  for (let m = Math.floor(visibleStart / 60) * 60; m < DAY_MINUTES; m += 60) hourTicks.push(m);

  function updateDay(dayIndex: number, updatedDay: Day) {
    const days = [...itinerary.days];
    days[dayIndex] = updatedDay;
    onItineraryChange({ ...itinerary, days });
  }

  function deleteBlock(dayIndex: number, blockIndex: number) {
    const day = itinerary.days[dayIndex];
    updateDay(dayIndex, { ...day, blocks: day.blocks.filter((_, i) => i !== blockIndex) });
  }

  async function handleModeChange(dayIndex: number, blockIndex: number, block: TransitBlock, mode: TransitBlock["mode"]) {
    setModePopover(null);
    if (mode === block.mode) return;
    const key = `${dayIndex}-${blockIndex}`;
    setEstimatingKey(key);
    // The displayed "X 分鐘" is the real estimate, but the block's time-slot
    // (and therefore its visual height) always rounds up to the nearest 15
    // minutes, matching this app's scheduling grid everywhere else.
    const estimated = (await estimateTravelTimeAI(block.from, block.to, mode)) ?? block.minutes;
    const day = itinerary.days[dayIndex];
    const blocks = [...day.blocks];
    const current = blocks[blockIndex] as TransitBlock;
    const { startMin } = blockTimeRange(current);
    const maxEnd = blockIndex + 1 < blocks.length ? blockTimeRange(blocks[blockIndex + 1]).startMin : DAY_MINUTES;
    const clampedEnd = Math.max(startMin + 1, Math.min(maxEnd, startMin + roundUpToQuarterHour(estimated)));
    blocks[blockIndex] = { ...current, mode, minutes: estimated, arrival: toHHMM(clampedEnd) };
    updateDay(dayIndex, { ...day, blocks });
    setEstimatingKey(null);
  }

  function beginDrag(e: ReactPointerEvent, dayIndex: number, blockIndex: number, mode: DragState["mode"]) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      dayIndex,
      blockIndex,
      startClientY: e.clientY,
      originDay: itinerary.days[dayIndex],
    };

    // On touch, holding still on a block (no vertical drag) for 500ms arms
    // multi-select instead of moving it — dragging your finger over other
    // blocks after that adds them to the selection.
    if (mode === "move" && e.pointerType === "touch") {
      longPressTimerRef.current = setTimeout(() => {
        if (
          dragRef.current &&
          dragRef.current.mode === "move" &&
          dragRef.current.dayIndex === dayIndex &&
          dragRef.current.blockIndex === blockIndex
        ) {
          touchSelectingRef.current = true;
          dragRef.current = null;
          setSelected((prev) => new Set(prev).add(keyOf(dayIndex, blockIndex)));
        }
      }, 500);
    }
  }

  function onDragMove(e: ReactPointerEvent) {
    if (boxSelect) {
      const next = { ...boxSelect, endX: e.clientX, endY: e.clientY };
      setBoxSelect(next);
      updateSelectionFromBox(next);
      return;
    }

    if (touchSelectingRef.current) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const key = el?.closest("[data-select-key]")?.getAttribute("data-select-key");
      if (key) setSelected((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;

    // A real vertical drag means the user wants to move/resize, not
    // long-press-select — cancel the pending long-press timer.
    if (longPressTimerRef.current && Math.abs(e.clientY - drag.startClientY) > 6) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const rawDelta = (e.clientY - drag.startClientY) / PX_PER_MIN;
    if (drag.mode === "move") {
      const { startMin } = blockTimeRange(drag.originDay.blocks[drag.blockIndex]);
      const newStart = snap(startMin + rawDelta);
      updateDay(drag.dayIndex, moveBlockBy(drag.originDay, drag.blockIndex, newStart - startMin, new Set()));
    } else {
      const { startMin, endMin } = blockTimeRange(drag.originDay.blocks[drag.blockIndex]);
      const edge = drag.mode === "resize-start" ? "start" : "end";
      const base = edge === "start" ? startMin : endMin;
      const newTime = snap(base + rawDelta);
      updateDay(drag.dayIndex, resizeBlockEdge(drag.originDay, drag.blockIndex, edge, newTime, new Set()));
    }
  }

  function beginBoxSelect(e: ReactPointerEvent) {
    if (e.pointerType !== "mouse") return;
    if (e.target !== e.currentTarget) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelected(new Set());
    setBoxSelect({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY });
  }

  function endDrag() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchSelectingRef.current = false;
    dragRef.current = null;
    if (boxSelect) setBoxSelect(null);
  }

  return (
    <div
      onPointerMove={onDragMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="w-full overflow-hidden rounded-lg bg-white shadow dark:bg-neutral-900"
    >
      {boxSelect && (
        <div
          className="pointer-events-none fixed z-40 border-2 border-teal-500 bg-teal-500/10"
          style={{
            left: Math.min(boxSelect.startX, boxSelect.endX),
            top: Math.min(boxSelect.startY, boxSelect.endY),
            width: Math.abs(boxSelect.endX - boxSelect.startX),
            height: Math.abs(boxSelect.endY - boxSelect.startY),
          }}
        />
      )}
      <div className="flex h-[70vh] overflow-auto">
        <div className="sticky left-0 z-20 w-12 shrink-0 bg-white dark:bg-neutral-900">
          <div className="sticky top-0 z-20 h-14 border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
          <div className="relative" style={{ height: gridHeight }}>
            {hourTicks.map((m) => (
              <span
                key={m}
                className="absolute -top-2 right-1 text-[10px] text-neutral-400 dark:text-neutral-500"
                style={{ top: (m - visibleStart) * PX_PER_MIN }}
              >
                {String(Math.floor(m / 60)).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </div>

        {itinerary.days.map((day, dayIndex) => {
          const { day: dateNum, weekday } = formatColumnDate(day.date);
          const today = isToday(day.date);
          return (
            <div
              key={day.date}
              className="min-w-[110px] flex-1 shrink-0 border-l border-neutral-100 dark:border-neutral-800"
            >
              <div className="sticky top-0 z-10 flex h-14 items-center justify-center gap-1.5 border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold leading-none ${
                    today ? "bg-teal-600 text-white" : "text-neutral-700 dark:text-neutral-200"
                  }`}
                >
                  {dateNum}
                </span>
                <span className="text-sm font-bold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  週{weekday}
                </span>
              </div>
              <div className="relative" style={{ height: gridHeight }} onPointerDown={beginBoxSelect}>
                {hourTicks.map((m) => (
                  <div
                    key={m}
                    className="absolute left-0 right-0 border-t border-neutral-100 dark:border-neutral-800"
                    style={{ top: (m - visibleStart) * PX_PER_MIN }}
                  />
                ))}

                {day.blocks.map((block, blockIndex) => {
                  const { startMin, endMin } = blockTimeRange(block);
                  const top = (startMin - visibleStart) * PX_PER_MIN;
                  const height = Math.max((endMin - startMin) * PX_PER_MIN, MIN_BLOCK_HEIGHT);

                  if (block.type === "transit") {
                    const key = `${dayIndex}-${blockIndex}`;
                    const estimating = estimatingKey === key;
                    const modeInfo = transitModeInfo(block.mode);
                    return (
                      <div key={blockIndex}>
                        <div
                          ref={(el) => {
                            if (el) blockElsRef.current.set(key, el);
                            else blockElsRef.current.delete(key);
                          }}
                          data-select-key={key}
                          onPointerDown={(e) => beginDrag(e, dayIndex, blockIndex, "move")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setModePopover(modePopover?.dayIndex === dayIndex && modePopover?.blockIndex === blockIndex ? null : { dayIndex, blockIndex });
                          }}
                          style={{ top, height }}
                          className={`absolute left-0.5 right-0.5 flex cursor-grab items-center gap-1 overflow-hidden rounded-lg border px-1.5 py-1 text-left text-sm leading-tight active:cursor-grabbing ${TRANSIT_BLOCK_CLASS} ${
                            selected.has(key) ? "ring-2 ring-teal-500" : ""
                          }`}
                        >
                          {estimating ? (
                            <Icon name="progress_activity" className="shrink-0 animate-spin text-sm" />
                          ) : (
                            <Icon name={modeInfo.icon} className="shrink-0 text-sm" />
                          )}
                          <span className="truncate font-bold">
                            {modeInfo.label} {block.minutes} 分鐘
                          </span>
                          <div
                            onPointerDown={(e) => beginDrag(e, dayIndex, blockIndex, "resize-start")}
                            className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
                          />
                          <div
                            onPointerDown={(e) => beginDrag(e, dayIndex, blockIndex, "resize-end")}
                            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                          />
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBlock(dayIndex, blockIndex);
                            }}
                            aria-label="刪除"
                            className="absolute right-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center"
                          >
                            <Icon name="close" className="text-[10px]" />
                          </button>
                        </div>

                        {modePopover?.dayIndex === dayIndex && modePopover?.blockIndex === blockIndex && (
                          <div
                            ref={popoverRef}
                            style={{ top: top + height + 4 }}
                            className="absolute left-0.5 z-30 flex items-center gap-1 rounded-xl border border-neutral-100 bg-white px-2 py-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                          >
                            {TRANSIT_MODES.map((m) => (
                              <button
                                key={m.value}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleModeChange(dayIndex, blockIndex, block, m.value);
                                }}
                                aria-label={m.label}
                                className={`rounded-lg p-1.5 ${
                                  m.value === block.mode
                                    ? "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                                    : "text-neutral-400 hover:bg-neutral-50 dark:text-neutral-500 dark:hover:bg-neutral-800"
                                }`}
                              >
                                <Icon name={m.icon} className="text-base" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const activityKey = keyOf(dayIndex, blockIndex);
                  return (
                    <div
                      key={blockIndex}
                      ref={(el) => {
                        if (el) blockElsRef.current.set(activityKey, el);
                        else blockElsRef.current.delete(activityKey);
                      }}
                      data-select-key={activityKey}
                      onPointerDown={(e) => beginDrag(e, dayIndex, blockIndex, "move")}
                      style={{ top, height }}
                      className={`absolute left-0.5 right-0.5 cursor-grab overflow-hidden rounded-lg border px-1.5 py-1 text-left text-sm leading-tight active:cursor-grabbing ${CATEGORY_BLOCK_CLASS[block.category]} ${
                        selected.has(activityKey) ? "ring-2 ring-teal-500" : ""
                      }`}
                    >
                      <div className="truncate font-semibold">{block.title}</div>
                      <div className="truncate font-bold opacity-80">{toDisplayTime(block.start)}</div>
                      <div
                        onPointerDown={(e) => beginDrag(e, dayIndex, blockIndex, "resize-start")}
                        className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
                      />
                      <div
                        onPointerDown={(e) => beginDrag(e, dayIndex, blockIndex, "resize-end")}
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                      />
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBlock(dayIndex, blockIndex);
                        }}
                        aria-label="刪除"
                        className="absolute right-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center"
                      >
                        <Icon name="close" className="text-[10px]" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">已選取 {selected.size} 項</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => shiftSelected(-15)}
              className="rounded-lg bg-neutral-100 px-2 py-1.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              往前 15 分
            </button>
            <button
              onClick={() => shiftSelected(15)}
              className="rounded-lg bg-neutral-100 px-2 py-1.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              往後 15 分
            </button>
            <button
              onClick={deleteSelected}
              className="rounded-lg bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-600 dark:bg-red-950 dark:text-red-300"
            >
              刪除
            </button>
            <button
              onClick={() => setSelected(new Set())}
              aria-label="取消選取"
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Icon name="close" className="text-base" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
