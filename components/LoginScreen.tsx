"use client";

import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Icon from "./Icon";

export default function LoginScreen() {
  const searchParams = useSearchParams();
  const authRequired = searchParams.get("authRequired");
  const authError = searchParams.get("authError");

  async function handleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/upcoming` },
    });
  }

  return (
    <div className="flex h-[80vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Icon name="flight_takeoff" className="text-5xl text-teal-600" />
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Bamos</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        AI 行程規劃 — 輸入片段文字，自動生成完整旅遊行程
      </p>
      {authRequired && (
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400">請先登入才能繼續</p>
      )}
      {authError && <p className="text-sm font-medium text-red-500">登入失敗，請再試一次</p>}
      <button
        onClick={handleLogin}
        className="mt-2 flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
          />
        </svg>
        使用 Google 登入
      </button>
    </div>
  );
}
