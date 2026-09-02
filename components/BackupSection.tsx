import type { BackupPlan } from "@/lib/schema";
import Icon from "./Icon";

export default function BackupSection({ plans }: { plans: BackupPlan[] }) {
  if (!plans.length) return null;
  return (
    <div className="mx-4 mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
        <Icon name="umbrella" className="text-lg" />
        雨備 / 備用行程
      </div>
      <div className="mt-3 space-y-3">
        {plans.map((plan, i) => (
          <div key={i} className="rounded-xl bg-white/70 p-3 dark:bg-neutral-900/70">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{plan.name}</span>
              <span className="text-[11px] text-amber-700 dark:text-amber-400">{plan.reason}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{plan.desc}</p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">建議停留 {plan.durationMin} 分鐘</p>
          </div>
        ))}
      </div>
    </div>
  );
}
