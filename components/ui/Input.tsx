import { useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export default function Input({
  label,
  hint,
  className = "",
  id,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
        </label>
      )}

      <input
        id={inputId}
        {...props}
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100",
          className,
        )}
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
