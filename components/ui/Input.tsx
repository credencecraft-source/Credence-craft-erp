import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  label,
  hint,
  error,
  className = "",
  id,
  ...props
}, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}{props.required ? " *" : ""}
        </label>
      )}

      <input
        ref={ref}
        id={inputId}
        {...props}
        suppressHydrationWarning
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={[props["aria-describedby"], hint ? `${inputId}-hint` : "", error ? `${inputId}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={cn(
          "w-full rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--erp-brand)] focus:ring-2 focus:ring-[var(--erp-brand-soft)] read-only:bg-slate-50 read-only:text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100",
          className,
        )}
      />
      {hint && <p id={`${inputId}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${inputId}-error`} className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
});

export default Input;
