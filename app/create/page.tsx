"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getHomeAddress, setHomeAddress as saveHomeAddress } from "@/lib/homeAddress";

const PENDING_TEXT_KEY = "bamos.pendingText";
const PENDING_ID_KEY = "bamos.pendingId";
const PENDING_HOME_ADDRESS_KEY = "bamos.pendingHomeAddress";

export default function CreatePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Reading localStorage: unavailable during SSR, so this must run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHomeAddress(getHomeAddress());
  }, []);

  function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    const tempId = crypto.randomUUID();
    window.sessionStorage.setItem(PENDING_TEXT_KEY, text);
    window.sessionStorage.setItem(PENDING_ID_KEY, tempId);
    window.sessionStorage.setItem(PENDING_HOME_ADDRESS_KEY, homeAddress.trim());
    if (homeAddress.trim()) saveHomeAddress(homeAddress.trim());
    router.push(`/upcoming?generating=${tempId}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8">
      <h1 className="text-2xl font-bold text-neutral-900">建立活動</h1>
      <p className="mt-1 text-sm text-neutral-500">
        輸入片段的時間、地點、活動，AI 會幫你規劃成完整行程表。
      </p>

      <label className="mt-4 block text-sm font-semibold text-neutral-700">住家地址</label>
      <input
        value={homeAddress}
        onChange={(e) => setHomeAddress(e.target.value)}
        placeholder="例如：台北市信義區松仁路100號（選填，用於估算出發交通時間）"
        className="mt-1.5 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
      />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"例如：\n午餐 1:00 野夫炊煙\n3:00 到民宿\n晚上想吃海鮮"}
        rows={10}
        className="mt-4 w-full rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-800 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
      />

      <button
        onClick={handleSubmit}
        disabled={!text.trim() || submitting}
        className="mt-4 w-full rounded-2xl bg-teal-600 py-3.5 text-center font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        送出
      </button>
    </div>
  );
}
