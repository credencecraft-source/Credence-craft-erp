import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface Option {
  label: string;
  value: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options?: Option[];
  children?: ReactNode;
}

export default function Select({
  label,
  hint,
  options,
  className = "",
  children,
  id,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
        </label>
      )}

      <select
        id={selectId}
        {...props}
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100",
          className,
        )}
      >
        {options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
