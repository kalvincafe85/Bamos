"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { ActivityBlock } from "@/lib/schema";
import { toDisplayTime } from "@/lib/time";
import { fetchPhotoUrl, googleMapsDirectionsUrl } from "@/lib/photo";
import Icon from "./Icon";
import PhotoEditSheet from "./PhotoEditSheet";

const CATEGORY_LABEL: Record<ActivityBlock["category"], string> = {
  attraction: "景點",
  meal: "餐廳",
  lodging: "住宿",
  other: "行程",
};

// Brand palette (藍/橘 per user spec): 餐廳 uses 橘, 行程 uses 藍; other
// categories keep the default green/teal pill styling.
const CATEGORY_PILL_CLASS: Record<ActivityBlock["category"], string> = {
  attraction: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  meal: "bg-[#F0930A]/10 text-[#F0930A] dark:bg-[#F0930A]/20",
  lodging: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  other: "bg-[#1BA1E8]/10 text-[#1BA1E8] dark:bg-[#1BA1E8]/20",
};

export default function ActivityCard({
  block,
  editable = false,
  onTimeClick,
  onPhotoChange,
  onGripPointerDown,
  onDelete,
  editingText = false,
  onTitleChange,
  onTimeChange,
  onDescriptionChange,
  isPinned = false,
  onTogglePin,
  expanded: controlledExpanded,
  onExpandedChange,
  filling = false,
  showHomeAddress = false,
  homeAddress = "",
  onHomeAddressChange,
}: {
  block: ActivityBlock;
  editable?: boolean;
  onTimeClick?: () => void;
  onPhotoChange?: (url: string | undefined, offsetY: number | undefined) => void;
  // When set, a small drag-grip is rendered in the header — used to embed
  // this card inside a container (e.g. the calendar day view) that needs to
  // initiate a whole-card drag without it fighting the header's own
  // expand/collapse click.
  onGripPointerDown?: (e: PointerEvent) => void;
  // When set, a delete (×) button is rendered in the header; clicking it
  // asks for confirmation before calling this.
  onDelete?: () => void;
  // When true, the title/time/description all render as editable fields
  // instead of static text/drag-only (used by the calendar view's "編輯" mode).
  editingText?: boolean;
  onTitleChange?: (title: string) => void;
  onTimeChange?: (field: "start" | "end", value: string) => void;
  onDescriptionChange?: (description: string) => void;
  // When onTogglePin is set, the clock icon becomes a pin toggle: pinned
  // blocks never move when other blocks in the day get dragged/resized —
  // everything else gets squeezed around them instead.
  isPinned?: boolean;
  onTogglePin?: () => void;
  // Expand/collapse can be controlled from outside (e.g. a "collapse all" in
  // the calendar view); omit both to fall back to the card's own state.
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  // True while AI is filling in the rest of this block's details after a
  // quick manual add (see the "+" add-activity flow in CalendarDayView).
  filling?: boolean;
  // Only true for the very first activity of the trip's first day, and the
  // very last activity of its last day — shown next to 地圖導航, editable
  // only in edit mode, so the user can confirm/adjust the home address used
  // to estimate the opening/closing commute.
  showHomeAddress?: boolean;
  homeAddress?: string;
  onHomeAddressChange?: (address: string) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const expanded = controlledExpanded ?? internalExpanded;
  function setExpanded(next: boolean) {
    if (onExpandedChange) onExpandedChange(next);
    else setInternalExpanded(next);
  }
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleDraft, setTitleDraft] = useState(block.title);
  const [descriptionDraft, setDescriptionDraft] = useState(block.description);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  // Measure synchronously before first paint so a card that starts expanded
  // renders at its real height immediately — no visible grow-from-0 flash.
  useLayoutEffect(() => {
    if (bodyContentRef.current) setBodyHeight(bodyContentRef.current.scrollHeight);
  }, []);

  // Keep the collapsible body's real content height measured at all times
  // (even while collapsed/clipped to 0) so expanding always animates toward
  // an already-known pixel value instead of the browser having to resolve a
  // "1fr" target for the first time — that first-resolve is what caused the
  // stutter expand had that collapse never did.
  useEffect(() => {
    const el = bodyContentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBodyHeight(el.scrollHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTitleDraft(block.title);
  }, [block.title]);

  useEffect(() => {
    setDescriptionDraft(block.description);
  }, [block.description]);

  // Edit mode always needs the full card visible (time, description, etc.)
  useEffect(() => {
    if (editingText) setExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingText]);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== block.title) onTitleChange?.(trimmed);
    else setTitleDraft(block.title);
  }

  function commitDescription() {
    if (descriptionDraft !== block.description) onDescriptionChange?.(descriptionDraft);
  }

  function renderTimeIcon() {
    if (!onTogglePin) return <Icon name="schedule" className="shrink-0 text-lg" />;
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={`shrink-0 ${isPinned ? "text-amber-500" : "text-neutral-400 dark:text-neutral-500"}`}
        aria-label={isPinned ? "取消釘選這個行程" : "釘選這個行程（不受其他行程拖曳影響）"}
      >
        <Icon name={isPinned ? "push_pin" : "schedule"} className="text-lg" />
      </span>
    );
  }

  useEffect(() => {
    if (block.photoOverride) return;
    let cancelled = false;
    fetchPhotoUrl(block.photoQuery).then((url) => {
      if (!cancelled) {
        setFetchedUrl(url);
        setPhotoLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [block.photoQuery, block.photoOverride]);

  const photoUrl = block.photoOverride ?? fetchedUrl;

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <button
        onClick={() => {
          if (editingText) return;
          setExpanded(!expanded);
          setConfirmingDelete(false);
        }}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: `center ${block.photoOffsetY ?? 50}%` }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-300 dark:text-neutral-600">
              <Icon name={photoLoaded ? "image" : "hourglass_top"} className="text-lg" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {expanded ? (
            <div className="flex min-w-0 items-center gap-2">
              {renderTimeIcon()}
              {editingText ? (
                <span onClick={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1">
                  <input
                    type="time"
                    value={block.start}
                    onChange={(e) => onTimeChange?.("start", e.target.value)}
                    className="rounded border border-teal-300 bg-white px-1 py-0.5 text-base font-bold text-neutral-900 outline-none dark:border-teal-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                  <span className="text-neutral-400">–</span>
                  <input
                    type="time"
                    value={block.end}
                    onChange={(e) => onTimeChange?.("end", e.target.value)}
                    className="rounded border border-teal-300 bg-white px-1 py-0.5 text-base font-bold text-neutral-900 outline-none dark:border-teal-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </span>
              ) : editable ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onTimeClick?.();
                  }}
                  className="shrink-0 text-base font-bold text-neutral-700 dark:text-neutral-200"
                >
                  {toDisplayTime(block.start)}
                  {block.start !== block.end && ` – ${toDisplayTime(block.end)}`}
                </span>
              ) : (
                <span className="shrink-0 text-base font-bold text-neutral-700 dark:text-neutral-200">
                  {toDisplayTime(block.start)}
                  {block.start !== block.end && ` – ${toDisplayTime(block.end)}`}
                </span>
              )}

              {editingText ? (
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-teal-300 bg-white px-2 py-1 text-base font-bold text-neutral-900 outline-none dark:border-teal-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              ) : (
                <h3 className="min-w-0 flex-1 truncate text-base font-bold leading-tight text-neutral-900 dark:text-neutral-100">
                  {block.title}
                </h3>
              )}

              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_PILL_CLASS[block.category]}`}>
                {CATEGORY_LABEL[block.category]}
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              {renderTimeIcon()}
              <span className="shrink-0 text-base font-bold text-neutral-700 dark:text-neutral-200">
                {toDisplayTime(block.start)}
              </span>
              {editingText ? (
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="w-full min-w-0 rounded-lg border border-teal-300 bg-white px-2 py-1 text-base font-bold text-neutral-900 outline-none dark:border-teal-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              ) : (
                <h3 className="truncate text-base font-bold text-neutral-900 dark:text-neutral-100">{block.title}</h3>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onGripPointerDown && (
            <span
              onPointerDown={onGripPointerDown}
              onClick={(e) => e.stopPropagation()}
              className="cursor-grab rounded p-1 text-neutral-300 active:cursor-grabbing dark:text-neutral-600"
            >
              <Icon name="drag_indicator" />
            </span>
          )}
          <Icon
            name="expand_more"
            className={`rounded p-1 text-neutral-400 transition-transform dark:text-neutral-500 ${expanded ? "rotate-180" : ""}`}
          />
          {onDelete &&
            (confirmingDelete ? (
              <span onClick={(e) => e.stopPropagation()} className="ml-1.5 flex items-center gap-1 border-l border-neutral-200 pl-1.5 dark:border-neutral-700">
                <button
                  onClick={() => {
                    onDelete();
                    setConfirmingDelete(false);
                  }}
                  className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                >
                  刪除
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
                >
                  取消
                </button>
              </span>
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDelete(true);
                }}
                className="ml-1 rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-500 dark:text-neutral-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                aria-label="刪除這個行程"
              >
                <Icon name="close" />
              </span>
            ))}
        </div>
      </button>

      <div
        className={`overflow-hidden transition-[height] duration-300 ${expanded ? "ease-out" : "ease-linear"}`}
        style={{ height: expanded ? bodyHeight : 0 }}
      >
        <div ref={bodyContentRef} className="px-4 pb-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (editable) setEditingPhoto(true);
            }}
            className="relative mt-3 h-36 w-full overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800"
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={block.title}
                className="h-full w-full object-cover"
                style={{ objectPosition: `center ${block.photoOffsetY ?? 50}%` }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-300 dark:text-neutral-600">
                <Icon name={photoLoaded ? "image" : "hourglass_top"} className="text-4xl" />
              </div>
            )}
            {editable && (
              <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white">
                <Icon name="photo" className="text-lg" />
              </span>
            )}
          </button>

          <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-2">
            <a
              href={googleMapsDirectionsUrl(block.mapQuery)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-teal-700 hover:underline dark:text-teal-400"
            >
              <Icon name="location_on" className="text-lg" />
              地圖導航
            </a>
            {editingText && showHomeAddress && (
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Icon name="home" className="shrink-0 text-base text-neutral-400 dark:text-neutral-500" />
                <input
                  value={homeAddress}
                  onChange={(e) => onHomeAddressChange?.(e.target.value)}
                  placeholder="輸入住家地址"
                  className="min-w-0 flex-1 rounded border border-teal-300 bg-white px-1.5 py-0.5 text-xs text-neutral-700 outline-none dark:border-teal-700 dark:bg-neutral-900 dark:text-neutral-200"
                />
              </div>
            )}
            {block.hours && (
              <div className="flex items-center gap-1.5">
                <Icon name="store" className="text-base text-neutral-400 dark:text-neutral-500" />
                營業時間: {block.hours}
              </div>
            )}
            {block.parking && (
              <div className="col-span-full flex items-center gap-1.5">
                <Icon name="local_parking" className="text-base text-neutral-400 dark:text-neutral-500" />
                停車: {block.parking}
              </div>
            )}
          </div>

          {editingText ? (
            <div className="mt-3 flex gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800">
              <Icon name="auto_awesome" className="mt-1 shrink-0 text-sm text-amber-500" />
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitDescription}
                placeholder="行程介紹"
                rows={2}
                className="w-full resize-none rounded-lg border border-teal-300 bg-white px-2 py-1 text-xs leading-relaxed text-neutral-700 outline-none dark:border-teal-700 dark:bg-neutral-900 dark:text-neutral-200"
              />
            </div>
          ) : filling ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
              <Icon name="progress_activity" className="animate-spin text-sm" />
              AI 補充行程資訊中...
            </div>
          ) : (
            block.description && (
              <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                <p>{block.description}</p>
              </div>
            )
          )}
        </div>
      </div>

      {editingPhoto && (
        <PhotoEditSheet
          currentUrl={photoUrl}
          currentOffsetY={block.photoOffsetY ?? 50}
          hasOverride={!!block.photoOverride}
          onApply={(url, offsetY) => {
            onPhotoChange?.(url, offsetY);
            setEditingPhoto(false);
          }}
          onReset={() => {
            onPhotoChange?.(undefined, undefined);
            setEditingPhoto(false);
          }}
          onClose={() => setEditingPhoto(false)}
        />
      )}
    </div>
  );
}
