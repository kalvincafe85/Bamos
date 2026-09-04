"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ActivityBlock, Day, TransitBlock } from "@/lib/schema";
import { blockTimeRange, insertActivityAt, resizeBlockEdge } from "@/lib/timeline";
import { toMinutes, toHHMM, roundUpToQuarterHour } from "@/lib/time";
import { estimateTravelTimeAI } from "@/lib/travelTime";
import { getHomeAddress, setHomeAddress as saveHomeAddress } from "@/lib/homeAddress";
import Icon from "./Icon";
import ActivityCard from "./ActivityCard";
import AddActivitySheet from "./AddActivitySheet";

const PX_PER_MIN = 2; // 1440min * 2px = 2880px tall — deliberately taller than a
// typical Google Calendar viewport so the whole day scrolls with the page.
const DAY_MINUTES = 1440;
const INSERT_SNAP_MIN = 15; // grid the hover/click "insert here" position snaps to
const NEW_ACTIVITY_DURATION_MIN = 60; // duration of a newly-inserted activity
const CREATE_SLOT_VISUAL_HEIGHT = 30; // just the hover/input preview box's height, independent of duration
const BLOCK_GAP = 6; // px kept between stacked cards once their real content is measured
const TRANSIT_BLOCK_HEIGHT = 44; // fixed height regardless of the leg's actual duration — only the week view's blocks grow/shrink with time

const MODES: { value: TransitBlock["mode"]; icon: string }[] = [
  { value: "transit", icon: "directions_bus" },
  { value: "walk", icon: "directions_walk" },
  { value: "car", icon: "directions_car" },
  { value: "scooter", icon: "two_wheeler" },
  { value: "bicycle", icon: "directions_bike" },
];

// Reserved brand palette (user-specified 2026-08-31): 藍/綠/橘 always refer to
// these three hex codes going forward, wherever they're next used.
// 藍 blue = #1BA1E8, 綠 green = #6FA83C, 橘 orange = #F0930A

function snapToSlot(min: number): number {
  return Math.round(min / INSERT_SNAP_MIN) * INSERT_SNAP_MIN;
}

function minutesToHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export default function CalendarDayView({
  day,
  editable = false,
  onDayChange,
  onOpenWeekView,
  onShare,
  destination = "",
  isFirstDay = false,
  isLastDay = false,
}: {
  day: Day;
  editable?: boolean;
  onDayChange: (day: Day) => void;
  // When set, a calendar icon is rendered alongside the edit/collapse buttons,
  // switching to the full week-view calendar for this trip.
  onOpenWeekView?: () => void;
  // When set, a share icon opens the share-link popover for this trip.
  onShare?: () => void;
  // Used as context for the AI when filling in a manually-added activity's details.
  destination?: string;
  // Whether this is the trip's first/last day — used to show the editable
  // home-address field on the opening/closing activity in edit mode.
  isFirstDay?: boolean;
  isLastDay?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lockedTimes = new Set(day.lockedTimes ?? []);
  const [modePopoverIndex, setModePopoverIndex] = useState<number | null>(null);
  const [creatingAt, setCreatingAt] = useState<number | null>(null);
  const [homeAddress, setHomeAddressState] = useState("");

  useEffect(() => {
    setHomeAddressState(getHomeAddress());
  }, []);

  function handleHomeAddressChange(address: string) {
    setHomeAddressState(address);
    saveHomeAddress(address);
  }
  const [creatingTitle, setCreatingTitle] = useState("");
  const [hoverAt, setHoverAt] = useState<number | null>(null);
  const [confirmingDeleteIndex, setConfirmingDeleteIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [collapsedIndices, setCollapsedIndices] = useState<Set<number>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);
  const [visibleStart, setVisibleStart] = useState(0);
  const [packedTops, setPackedTops] = useState<number[]>([]);
  const [packedBottoms, setPackedBottoms] = useState<number[]>([]);
  const [packedBottom, setPackedBottom] = useState(0);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [fillingKey, setFillingKey] = useState<string | null>(null);
  const dayRef = useRef(day);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  const earliestMin = day.blocks.length
    ? Math.min(...day.blocks.map((b) => blockTimeRange(b).startMin))
    : 8 * 60;
  const collapsedStart = Math.max(0, Math.floor(earliestMin / 60) * 60);

  const activityIndices = day.blocks.reduce<number[]>((acc, b, i) => {
    if (b.type === "activity") acc.push(i);
    return acc;
  }, []);
  const allCollapsed = activityIndices.length > 0 && activityIndices.every((i) => collapsedIndices.has(i));
  const firstActivityIndex = activityIndices[0] ?? -1;
  const lastActivityIndex = activityIndices[activityIndices.length - 1] ?? -1;

  // The grid starts just above the day's first block, hiding the empty
  // hours before it.
  useEffect(() => {
    setVisibleStart(collapsedStart);
  }, [collapsedStart]);

  // Blocks are placed at their real time by default, but an activity card's
  // actual rendered height (photo, description, etc.) can exceed its time
  // slot. This measures each card after paint and pushes any block whose
  // natural top would land inside the previous one's real bottom edge down
  // just enough to clear it — so cards never visually overlap, and only
  // "borrow" extra vertical space where the content genuinely needs it.
  useEffect(() => {
    function recompute() {
      let cursor = -Infinity;
      let bottom = 0;
      const bottoms: number[] = [];
      const tops = day.blocks.map((block, i) => {
        const { startMin, endMin } = blockTimeRange(block);
        const naturalTop = (startMin - visibleStart) * PX_PER_MIN;
        // A real scheduling gap (e.g. free time between activities) is only
        // worth showing when both the most recent activity before this one
        // AND this block itself are expanded — that's the only time the gap
        // is actually visible/meaningful. Transit rows in between don't reset
        // this — they're never collapsed themselves, so a collapsed activity
        // two blocks back still keeps the gap compact right up to here. If
        // either side is still collapsed, squeeze the gap out so
        // expanding/collapsing one card never shifts an unrelated
        // still-collapsed neighbor. The very first block always keeps its
        // real time anchor.
        let prevCollapsed = false;
        for (let j = i - 1; j >= 0; j--) {
          if (day.blocks[j].type === "activity") {
            prevCollapsed = collapsedIndices.has(j);
            break;
          }
        }
        const selfCollapsed = block.type === "activity" && collapsedIndices.has(i);
        const top =
          (allCollapsed || prevCollapsed || selfCollapsed) && cursor !== -Infinity
            ? cursor
            : Math.max(naturalTop, cursor);
        const knownHeight =
          block.type === "transit" ? TRANSIT_BLOCK_HEIGHT : Math.max((endMin - startMin) * PX_PER_MIN, 22);
        const measured = block.type === "activity" ? blockRefs.current[i]?.offsetHeight ?? knownHeight : knownHeight;
        cursor = top + measured + BLOCK_GAP;
        bottom = top + measured;
        bottoms[i] = bottom;
        return top;
      });
      setPackedTops(tops);
      setPackedBottoms(bottoms);
      setPackedBottom(bottom);
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    blockRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [day.blocks, visibleStart, allCollapsed, collapsedIndices]);

  useEffect(() => {
    if (modePopoverIndex === null) return;
    function handlePointerDown(e: PointerEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setModePopoverIndex(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [modePopoverIndex]);

  function clientYToRawMinutes(clientY: number): number {
    const top = gridRef.current?.getBoundingClientRect().top ?? 0;
    return visibleStart + (clientY - top) / PX_PER_MIN;
  }

  function clampSlotStart(min: number): number {
    return Math.max(0, Math.min(DAY_MINUTES - INSERT_SNAP_MIN, snapToSlot(min)));
  }

  function updateBlockPhoto(blockIndex: number, url: string | undefined, offsetY: number | undefined) {
    const blocks = [...day.blocks];
    blocks[blockIndex] = { ...blocks[blockIndex], photoOverride: url, photoOffsetY: offsetY } as (typeof blocks)[number];
    onDayChange({ ...day, blocks });
  }

  function deleteBlock(blockIndex: number) {
    onDayChange({ ...day, blocks: day.blocks.filter((_, idx) => idx !== blockIndex) });
  }

  function togglePin(startTime: string) {
    const next = new Set(lockedTimes);
    if (next.has(startTime)) next.delete(startTime);
    else next.add(startTime);
    onDayChange({ ...day, lockedTimes: Array.from(next) });
  }

  function toggleCollapseAll() {
    setCollapsedIndices(allCollapsed ? new Set() : new Set(activityIndices));
  }

  function updateBlockTitle(blockIndex: number, title: string) {
    const blocks = [...day.blocks];
    blocks[blockIndex] = { ...blocks[blockIndex], title } as (typeof blocks)[number];
    onDayChange({ ...day, blocks });
  }

  function updateBlockDescription(blockIndex: number, description: string) {
    const blocks = [...day.blocks];
    blocks[blockIndex] = { ...blocks[blockIndex], description } as (typeof blocks)[number];
    onDayChange({ ...day, blocks });
  }

  function updateBlockTime(blockIndex: number, field: "start" | "end", value: string) {
    const blocks = [...day.blocks];
    blocks[blockIndex] = { ...blocks[blockIndex], [field]: value } as (typeof blocks)[number];
    onDayChange({ ...day, blocks });
  }

  function isTimeOccupied(min: number): boolean {
    return day.blocks.some((b) => {
      const { startMin, endMin } = blockTimeRange(b);
      return min >= startMin && min < endMin;
    });
  }

  function handleGridMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (!editable || creatingAt !== null || e.target !== e.currentTarget) {
      if (hoverAt !== null) setHoverAt(null);
      return;
    }
    const slot = clampSlotStart(clientYToRawMinutes(e.clientY));
    if (isTimeOccupied(slot)) {
      if (hoverAt !== null) setHoverAt(null);
      return;
    }
    setHoverAt(slot);
  }

  function handleGridMouseLeave() {
    setHoverAt(null);
  }

  function handleGridClick(e: MouseEvent<HTMLDivElement>) {
    if (!editable || e.target !== e.currentTarget) return;
    const slot = hoverAt ?? clampSlotStart(clientYToRawMinutes(e.clientY));
    if (isTimeOccupied(slot)) return;
    setCreatingAt(slot);
    setCreatingTitle("");
    setHoverAt(null);
  }

  function confirmCreate() {
    const trimmed = creatingTitle.trim();
    if (trimmed && creatingAt !== null) {
      onDayChange(insertActivityAt(day, minutesToHHMM(creatingAt), trimmed, new Set(), NEW_ACTIVITY_DURATION_MIN));
    }
    setCreatingAt(null);
    setCreatingTitle("");
  }

  function cancelCreate() {
    setCreatingAt(null);
    setCreatingTitle("");
  }

  function suggestedAddTime(): string {
    if (day.blocks.length === 0) return "09:00";
    const last = day.blocks[day.blocks.length - 1];
    const endMin = Math.min(DAY_MINUTES - INSERT_SNAP_MIN, blockTimeRange(last).endMin);
    return minutesToHHMM(snapToSlot(endMin));
  }

  async function fillActivityInBackground(time: string, title: string) {
    try {
      const res = await fetch("/api/fill-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, destination, date: day.date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const details = data.details;
      const current = dayRef.current;
      const idx = current.blocks.findIndex(
        (b) => b.type === "activity" && b.start === time && b.title === title && b.description === ""
      );
      if (idx !== -1) {
        const blocks = [...current.blocks];
        blocks[idx] = { ...(blocks[idx] as ActivityBlock), ...details };
        onDayChange({ ...current, blocks });
      }
    } catch (err) {
      console.error("fill-activity failed", err);
    } finally {
      setFillingKey(null);
    }
  }

  function handleAddActivity(time: string, title: string) {
    if (isTimeOccupied(toMinutes(time))) return;
    onDayChange(insertActivityAt(day, time, title, lockedTimes, NEW_ACTIVITY_DURATION_MIN));
    setAddSheetOpen(false);
    setFillingKey(`${time}|${title}`);
    fillActivityInBackground(time, title);
  }

  async function handleModeChange(blockIndex: number, block: TransitBlock, mode: TransitBlock["mode"]) {
    if (mode === block.mode) {
      setModePopoverIndex(null);
      return;
    }
    const estimated = (await estimateTravelTimeAI(block.from, block.to, mode)) ?? block.minutes;
    const minutes = roundUpToQuarterHour(estimated);
    const blocks = [...day.blocks];
    blocks[blockIndex] = { ...block, mode, minutes };
    let updated = { ...day, blocks };
    const { startMin, endMin } = blockTimeRange(blocks[blockIndex]);
    if (endMin - startMin < minutes) {
      updated = resizeBlockEdge(updated, blockIndex, "end", startMin + minutes, lockedTimes);
    }
    onDayChange(updated);
    setModePopoverIndex(null);
  }

  // Manually pasted origin/destination Google Maps URLs (edit mode only) give
  // the AI a more precise pair of locations than the usual text-based
  // mapQuery. When present, they re-estimate both transit legs touching this
  // activity: the one arriving here (using this activity's own origin/
  // destination) and the one leaving here (using this activity's destination
  // paired with the next activity's own destinationMapUrl, if it has one set).
  async function handleMapUrlsChange(index: number, originUrl: string, destinationUrl: string) {
    const block = day.blocks[index] as ActivityBlock;
    const blocks = [...day.blocks];
    blocks[index] = { ...block, originMapUrl: originUrl, destinationMapUrl: destinationUrl };

    async function reestimateLeg(transitIndex: number, from: string, to: string) {
      const transit = blocks[transitIndex] as TransitBlock;
      const estimated = await estimateTravelTimeAI(from, to, transit.mode);
      if (estimated == null) return;
      const minutes = roundUpToQuarterHour(estimated);
      blocks[transitIndex] = { ...transit, minutes: estimated };
      const { startMin, endMin } = blockTimeRange(blocks[transitIndex]);
      if (endMin - startMin !== minutes) {
        const updated = resizeBlockEdge({ ...day, blocks }, transitIndex, "end", startMin + minutes, lockedTimes);
        blocks.splice(0, blocks.length, ...updated.blocks);
      }
    }

    const prevBlock = day.blocks[index - 1];
    if (originUrl.trim() && destinationUrl.trim() && prevBlock?.type === "transit") {
      await reestimateLeg(index - 1, originUrl.trim(), destinationUrl.trim());
    }

    const nextTransit = day.blocks[index + 1];
    const nextActivity = day.blocks[index + 2];
    if (
      destinationUrl.trim() &&
      nextTransit?.type === "transit" &&
      nextActivity?.type === "activity" &&
      nextActivity.destinationMapUrl?.trim()
    ) {
      await reestimateLeg(index + 1, destinationUrl.trim(), nextActivity.destinationMapUrl.trim());
    }

    onDayChange({ ...day, blocks });
  }

  // Left-side hour axis only: map each hour mark to a pixel position by
  // interpolating along the blocks' actual packed top/bottom edges, instead
  // of the fixed PX_PER_MIN scale. So when a card collapses (or expands),
  // the tick marks that fall within its time range immediately follow it up
  // or down — the ruler always matches what's really on screen. Block
  // positions themselves are untouched (still driven by packedTops).
  const timeAnchors = day.blocks.map((block, i) => {
    const { startMin, endMin } = blockTimeRange(block);
    const top = packedTops[i] ?? (startMin - visibleStart) * PX_PER_MIN;
    const bottom = packedBottoms[i] ?? top + Math.max((endMin - startMin) * PX_PER_MIN, 22);
    return { startMin, endMin, top, bottom };
  });

  function minutesToAxisPx(targetMin: number): number {
    if (timeAnchors.length === 0) return (targetMin - visibleStart) * PX_PER_MIN;

    const first = timeAnchors[0];
    if (targetMin <= first.startMin) {
      return first.top - (first.startMin - targetMin) * PX_PER_MIN;
    }
    for (let i = 0; i < timeAnchors.length; i++) {
      const a = timeAnchors[i];
      if (targetMin >= a.startMin && targetMin <= a.endMin) {
        const span = a.endMin - a.startMin;
        const frac = span > 0 ? (targetMin - a.startMin) / span : 0;
        return a.top + frac * (a.bottom - a.top);
      }
      const next = timeAnchors[i + 1];
      if (next && targetMin > a.endMin && targetMin < next.startMin) {
        const span = next.startMin - a.endMin;
        const frac = span > 0 ? (targetMin - a.endMin) / span : 0;
        return a.bottom + frac * (next.top - a.bottom);
      }
    }
    const last = timeAnchors[timeAnchors.length - 1];
    return last.bottom + (targetMin - last.endMin) * PX_PER_MIN;
  }

  return (
    <div
      className="px-4 pt-4"
      onClick={() => {
        if (editMode) {
          setEditMode(false);
          setConfirmingDeleteIndex(null);
        }
      }}
    >
      {editable && (
        <div className="mb-2 flex justify-end gap-2">
          {onOpenWeekView && (
            <button
              onClick={onOpenWeekView}
              aria-label="週檢視行事曆"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <Icon name="calendar_month" className="text-xl" />
            </button>
          )}
          {onShare && (
            <button
              onClick={onShare}
              aria-label="分享行程"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              <Icon name="ios_share" className="text-xl" />
            </button>
          )}
          <button
            onClick={toggleCollapseAll}
            aria-label={allCollapsed ? "全部展開" : "全部收合"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >
            <Icon name={allCollapsed ? "unfold_more" : "unfold_less"} className="text-xl" />
          </button>
          <button
            onClick={() => setAddSheetOpen(true)}
            aria-label="新增行程"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          >
            <Icon name="add" className="text-xl" />
          </button>
          <button
            onClick={() => {
              setEditMode((v) => !v);
              setConfirmingDeleteIndex(null);
            }}
            aria-label={editMode ? "完成編輯" : "編輯"}
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              editMode
                ? "bg-teal-600 text-white"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            <Icon name={editMode ? "check" : "edit"} className="text-xl" />
          </button>
        </div>
      )}
      <div
        ref={gridRef}
        onClick={handleGridClick}
        onMouseMove={handleGridMouseMove}
        onMouseLeave={handleGridMouseLeave}
        className="relative"
        style={{
          height: allCollapsed
            ? packedBottom
            : Math.max((DAY_MINUTES - visibleStart) * PX_PER_MIN, packedBottom),
        }}
      >
        {day.blocks.map((block, i) => {
            const { startMin, endMin } = blockTimeRange(block);
            const top = packedTops[i] ?? (startMin - visibleStart) * PX_PER_MIN;
            const height =
              block.type === "transit" ? TRANSIT_BLOCK_HEIGHT : Math.max((endMin - startMin) * PX_PER_MIN, 22);

            if (block.type === "transit") {
              return (
                <div key={i}>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editable) setModePopoverIndex(modePopoverIndex === i ? null : i);
                      setConfirmingDeleteIndex(null);
                    }}
                    style={{ top: 0, height, transform: `translateY(${top}px)` }}
                    className="absolute left-1 right-1 flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-md bg-neutral-50 px-2 text-sm text-neutral-500 transition-transform duration-500 ease-out will-change-transform dark:bg-neutral-900 dark:text-neutral-400"
                  >
                    <Icon name={MODES.find((m) => m.value === block.mode)?.icon ?? "directions_car"} className="shrink-0 text-base text-neutral-400 dark:text-neutral-500" />
                    <span className="truncate">
                      {block.from} → {block.to} · {block.minutes} mins
                    </span>
                    {editable &&
                      editMode &&
                      (confirmingDeleteIndex === i ? (
                        <span onClick={(e) => e.stopPropagation()} className="ml-auto flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => {
                              deleteBlock(i);
                              setConfirmingDeleteIndex(null);
                            }}
                            className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          >
                            刪除
                          </button>
                          <button
                            onClick={() => setConfirmingDeleteIndex(null)}
                            className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingDeleteIndex(i);
                          }}
                          className="ml-auto shrink-0 rounded p-0.5 text-neutral-300 hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                          aria-label="刪除這段交通"
                        >
                          <Icon name="close" className="text-sm" />
                        </span>
                      ))}
                  </div>

                  {modePopoverIndex === i && (
                    <div
                      ref={popoverRef}
                      style={{ top: top + height + 4 }}
                      className="absolute left-1 z-10 flex items-center gap-2 rounded-xl border border-neutral-100 bg-white px-2.5 py-2 text-xs shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      {MODES.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => handleModeChange(i, block, m.value)}
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

            return (
              <div
                key={i}
                ref={(el) => {
                  blockRefs.current[i] = el;
                }}
                style={{ top: 0, transform: `translateY(${top}px)` }}
                className="absolute left-1 right-1 transition-transform duration-500 ease-out will-change-transform"
              >
                <ActivityCard
                  block={block}
                  editable={editable}
                  onPhotoChange={(url, offsetY) => updateBlockPhoto(i, url, offsetY)}
                  onDelete={editable && editMode ? () => deleteBlock(i) : undefined}
                  editingText={editable && editMode}
                  onTitleChange={(title) => updateBlockTitle(i, title)}
                  onDescriptionChange={(description) => updateBlockDescription(i, description)}
                  onTimeChange={(field, value) => updateBlockTime(i, field, value)}
                  isPinned={lockedTimes.has(block.start)}
                  onTogglePin={editable ? () => togglePin(block.start) : undefined}
                  filling={fillingKey === `${block.start}|${block.title}`}
                  showHomeAddress={(isFirstDay && i === firstActivityIndex) || (isLastDay && i === lastActivityIndex)}
                  homeAddress={homeAddress}
                  onHomeAddressChange={handleHomeAddressChange}
                  onMapUrlsChange={(originUrl, destinationUrl) => handleMapUrlsChange(i, originUrl, destinationUrl)}
                  expanded={!collapsedIndices.has(i)}
                  onExpandedChange={(exp) =>
                    setCollapsedIndices((prev) => {
                      const next = new Set(prev);
                      if (exp) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
              </div>
            );
          })}

          {hoverAt !== null && (
            <div
              style={{ top: minutesToAxisPx(hoverAt), height: CREATE_SLOT_VISUAL_HEIGHT }}
              className="pointer-events-none absolute left-1 right-1 flex items-center"
            >
              <div className="w-full border-t border-dashed border-teal-300 dark:border-teal-700" />
              <div className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-teal-400 text-white dark:bg-teal-600">
                <Icon name="add" className="text-base" />
              </div>
            </div>
          )}

          {creatingAt !== null && (
            <div
              style={{ top: minutesToAxisPx(creatingAt), height: CREATE_SLOT_VISUAL_HEIGHT }}
              className="absolute left-1 right-1 z-10 flex items-center rounded-lg border-2 border-teal-400 bg-white p-2 shadow-lg dark:border-teal-600 dark:bg-neutral-900"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                value={creatingTitle}
                onChange={(e) => setCreatingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCreate();
                  if (e.key === "Escape") cancelCreate();
                }}
                onBlur={confirmCreate}
                placeholder="輸入新行程內容"
                className="w-full rounded px-1.5 py-1 pr-6 text-xl text-neutral-900 outline-none dark:text-neutral-100"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelCreate}
                aria-label="取消新增"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
              >
                <Icon name="close" className="text-base" />
              </button>
            </div>
          )}
        </div>
      {editable && (
        <p className="mt-2 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          滑鼠移到空白處會出現新增區塊，點擊後輸入內容，點外部或 Enter 確認、按 × 取消
        </p>
      )}
      {addSheetOpen && (
        <AddActivitySheet
          initialTime={suggestedAddTime()}
          isTimeTaken={(time) => isTimeOccupied(toMinutes(time))}
          onAdd={handleAddActivity}
          onClose={() => setAddSheetOpen(false)}
        />
      )}
    </div>
  );
}
