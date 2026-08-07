import type { ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { useFeatureEnabled } from "../store/featureFlagsStore";

interface FeatureGateProps {
  /** Feature-flag key (e.g. "content.tournaments"). Unknown flags default to enabled. */
  flag: string;
  children: ReactNode;
}

/**
 * Hides its children when the given feature flag is disabled, showing a notice
 * instead. Used to gate routes and individual UI sections.
 */
export function FeatureGate({ flag, children }: FeatureGateProps) {
  const enabled = useFeatureEnabled(flag);
  if (enabled) return <>{children}</>;

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <div className="flex flex-col items-center justify-center text-center p-10 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <ShieldOff className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-base font-black text-slate-900 dark:text-white">Feature disabled</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          This feature is currently turned off by the platform administrators.
        </p>
      </div>
    </div>
  );
}
