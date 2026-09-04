"use client";

import { useEffect, useRef, useState } from "react";
import { toPeriodDisplayTime } from "@/lib/time";
import Icon from "./Icon";

const SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

export default function TimePickerSheet({
  initialTime,
  validate,
  onConfirm,
  onCancel,
}: {
  initialTime: string;
  validate: (time: string) => string | null; // returns an error message, or null if valid
  onConfirm: (time: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(initialTime);
  const error = validate(selected);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
    // Only scroll once, on open — not on every re-selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-6"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xs flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-100 px-4 py-3 text-center text-sm font-semibold text-neutral-700">
          選擇時間
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {SLOTS.map((slot) => {
            const isSelected = slot === selected;
            return (
              <button
                key={slot}
                ref={isSelected ? selectedRef : undefined}
                onClick={() => setSelected(slot)}
                className={`flex w-full items-center justify-center py-2.5 text-sm transition-colors ${
                  isSelected ? "bg-teal-50 font-bold text-teal-700" : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {toPeriodDisplayTime(slot)}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="flex items-start gap-1.5 border-t border-neutral-100 px-4 py-2 text-xs text-red-500">
            <Icon name="error" className="mt-0.5 shrink-0 text-sm" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 border-t border-neutral-100 p-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-medium text-neutral-600"
          >
            取消
          </button>
          <button
            onClick={() => !error && onConfirm(selected)}
            disabled={!!error}
            className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  );
}
