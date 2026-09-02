"use client";

import { useRef, useState, type PointerEvent } from "react";
import Icon from "./Icon";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MAX_DIMENSION = 1000;

function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("讀取檔案失敗"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("圖片格式不支援"));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("無法處理圖片"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function PhotoEditSheet({
  currentUrl,
  currentOffsetY = 50,
  hasOverride,
  onApply,
  onReset,
  onClose,
}: {
  currentUrl: string | null;
  currentOffsetY?: number;
  hasOverride: boolean;
  onApply: (url: string, offsetY: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offsetY, setOffsetY] = useState(currentOffsetY);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startOffset: number } | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await resizeToDataUrl(file);
      setOffsetY(50);
      onApply(dataUrl, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setBusy(false);
    }
  }

  function handleUrlSubmit() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setOffsetY(50);
    onApply(trimmed, 50);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!currentUrl) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startOffset: offsetY };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const height = previewRef.current?.offsetHeight || 1;
    const deltaPercent = ((e.clientY - dragRef.current.startY) / height) * 100;
    setOffsetY(clamp(dragRef.current.startOffset - deltaPercent, 0, 100));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-neutral-800">更換照片</span>
          <button onClick={onClose} className="text-neutral-400">
            <Icon name="close" />
          </button>
        </div>

        {currentUrl && (
          <>
            <div
              ref={previewRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="mt-3 h-40 w-full touch-none overflow-hidden rounded-xl bg-neutral-100 [cursor:grab] active:[cursor:grabbing]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt="目前照片"
                draggable={false}
                className="h-full w-full select-none object-cover"
                style={{ objectPosition: `center ${offsetY}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-neutral-400">
              <span>上下拖曳可調整顯示範圍</span>
              {offsetY !== currentOffsetY && (
                <button
                  onClick={() => onApply(currentUrl, offsetY)}
                  className="font-semibold text-teal-600"
                >
                  儲存位置
                </button>
              )}
            </div>
          </>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
        >
          <Icon name="upload" className="text-base" />
          {busy ? "處理中..." : "從本機上傳"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="mt-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-neutral-100" />
          <span className="text-xs text-neutral-400">或</span>
          <div className="h-px flex-1 bg-neutral-100" />
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
            placeholder="貼上圖片網址"
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
          />
          <button
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim()}
            className="rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            套用
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        {hasOverride && (
          <button
            onClick={onReset}
            className="mt-4 w-full text-center text-xs font-medium text-neutral-400 underline"
          >
            移除自訂圖片，恢復自動搜尋
          </button>
        )}
      </div>
    </div>
  );
}
