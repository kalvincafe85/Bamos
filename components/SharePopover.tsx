"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

export default function SharePopover({
  itineraryId,
  onClose,
}: {
  itineraryId: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/share/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itineraryId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "分享連結建立失敗");
        setUrl(data.url as string);
      })
      .catch(() => setError(true));
  }, [itineraryId]);

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl dark:bg-neutral-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">分享行程</h2>
          <button onClick={onClose} aria-label="關閉" className="text-neutral-400">
            <Icon name="close" className="text-xl" />
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          任何人打開這個連結都能查看，點選「複製到我的行程」後會成為他們自己可編輯的獨立版本，不會影響你的原始行程。
        </p>
        {error && <p className="mt-3 text-sm text-red-500">建立分享連結失敗，請再試一次</p>}
        {!error && (
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={url ?? "產生連結中..."}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs text-neutral-600 outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            />
            <button
              onClick={handleCopy}
              disabled={!url}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Icon name={copied ? "check" : "content_copy"} className="text-sm" />
              {copied ? "已複製" : "複製"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
