import { LoaderCircle } from "lucide-react";

export default function PlatformLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center"
    >
      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
        <LoaderCircle className="h-4 w-4 animate-spin text-brand-600" aria-hidden="true" />
        Loading platform page…
      </span>
    </div>
  );
}
