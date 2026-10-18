"use client";

import { forwardRef, useId, type ChangeEvent, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";
import { normalizeUppercase, type TextCase } from "@/lib/utilities/text-case";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  textCase?: TextCase;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  label,
  hint,
  error,
  textCase = "uppercase",
  className = "",
  id,
  onChange,
  type,
  disabled,
  readOnly,
  ...props
}, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const shouldNormalizeText = textCase === "uppercase" && (type === undefined || type === "text" || type === "search");
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (shouldNormalizeText && !disabled && !readOnly) {
      event.currentTarget.value = normalizeUppercase(event.currentTarget.value);
    }
    onChange?.(event);
  };

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
        type={type}
        disabled={disabled}
        readOnly={readOnly}
        {...props}
        {...(shouldNormalizeText && typeof props.value === "string"
          ? { value: normalizeUppercase(props.value) }
          : {})}
        {...(shouldNormalizeText && typeof props.defaultValue === "string"
          ? { defaultValue: normalizeUppercase(props.defaultValue) }
          : {})}
        onChange={handleChange}
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
