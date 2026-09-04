"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { importLegacyItinerariesIfNeeded } from "@/lib/importLegacy";
import Icon from "./Icon";

export default function AuthBar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_IN") importLegacyItinerariesIfNeeded();
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [menuOpen]);

  if (!user) return null;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div ref={menuRef} className="fixed right-3 top-1 z-50">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="帳號選單"
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="account_circle" className="text-2xl" />
        )}
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-32 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-700 dark:text-neutral-200"
          >
            <Icon name="logout" className="text-base" />
            登出
          </button>
        </div>
      )}
    </div>
  );
}
