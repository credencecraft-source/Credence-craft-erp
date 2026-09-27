import { Loader2, Sparkles } from "lucide-react";

type NavigationLoadingOverlayProps = {
  label?: string;
  progress?: number;
};

export default function NavigationLoadingOverlay({
  label = "Opening workspace",
  progress,
}: NavigationLoadingOverlayProps) {
  const boundedProgress = Math.min(100, Math.max(0, progress ?? 40));
  const isDeterminate = progress !== undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white p-4"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl shadow-slate-200/70">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50">
            <span className="absolute inset-1 rounded-lg border border-emerald-200 motion-safe:animate-pulse" />
            <Sparkles className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Credence Craft</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{label}</p>
          </div>
          <Loader2 className="ml-auto h-5 w-5 shrink-0 animate-spin text-emerald-700" aria-hidden="true" />
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full bg-emerald-600 ${isDeterminate ? "transition-[width] duration-75 ease-out" : "w-2/5 animate-navigation-loading-progress"}`}
            style={isDeterminate ? { width: `${boundedProgress}%` } : undefined}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Preparing your workspace{isDeterminate ? ` ${Math.round(boundedProgress)}%` : ""}
        </p>
      </div>
    </div>
  );
}
