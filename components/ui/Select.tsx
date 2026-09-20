import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface Option {
  label: string;
  value: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options?: Option[];
  children?: ReactNode;
}

export default function Select({
  label,
  hint,
  error,
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
          {label}{props.required ? " *" : ""}
        </label>
      )}

      <select
        id={selectId}
        {...props}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={[props["aria-describedby"], hint ? `${selectId}-hint` : "", error ? `${selectId}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={cn(
          "w-full rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[var(--erp-brand)] focus:ring-2 focus:ring-[var(--erp-brand-soft)] disabled:cursor-not-allowed disabled:bg-slate-100",
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
      {hint && <p id={`${selectId}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${selectId}-error`} className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
