"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

const ROW_HEIGHT = 40;

const TIMES: string[] = [];
for (let m = 0; m < 24 * 60; m += 30) {
  TIMES.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

export default function AddActivitySheet({
  initialTime,
  isTimeTaken,
  onAdd,
  onClose,
}: {
  initialTime: string;
  // When set, times already covered by an existing activity are blocked —
  // new activities may not be inserted inside another one's time range.
  isTimeTaken?: (time: string) => boolean;
  onAdd: (time: string, title: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const initialIndex = Math.max(0, TIMES.indexOf(initialTime));
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const selectedTime = TIMES[selectedIndex];
  const taken = isTimeTaken?.(selectedTime) ?? false;

  useEffect(() => {
    listRef.current?.scrollTo({ top: initialIndex * ROW_HEIGHT, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    if (!listRef.current) return;
    const idx = Math.round(listRef.current.scrollTop / ROW_HEIGHT);
    setSelectedIndex(Math.max(0, Math.min(TIMES.length - 1, idx)));
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed || taken) return;
    onAdd(selectedTime, trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-6 dark:bg-neutral-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">新增行程</h2>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </div>

        <div className="relative mb-4">
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="mx-auto h-[120px] w-32 snap-y snap-mandatory overflow-y-auto"
            style={{ paddingTop: ROW_HEIGHT, paddingBottom: ROW_HEIGHT }}
          >
            {TIMES.map((t, i) => (
              <div
                key={t}
                className={`flex snap-center items-center justify-center text-lg transition-colors ${
                  i === selectedIndex
                    ? taken
                      ? "font-bold text-red-500 dark:text-red-400"
                      : "font-bold text-teal-600 dark:text-teal-400"
                    : "text-neutral-300 dark:text-neutral-600"
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                {t}
              </div>
            ))}
          </div>
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 w-32 -translate-x-1/2 -translate-y-1/2 rounded-lg border-y-2 ${
              taken ? "border-red-300 dark:border-red-800" : "border-teal-200 dark:border-teal-800"
            }`}
            style={{ height: ROW_HEIGHT }}
          />
        </div>

        {taken && (
          <p className="mb-3 -mt-2 text-center text-xs text-red-500 dark:text-red-400">
            這個時段已有其他行程，請選擇空白時段
          </p>
        )}

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="輸入行程標題"
          className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 outline-none focus:border-teal-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />

        <button
          onClick={submit}
          disabled={!title.trim() || taken}
          className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          新增行程
        </button>
      </div>
    </div>
  );
}
