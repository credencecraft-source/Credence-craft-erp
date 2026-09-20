import { useId, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export default function Textarea({
  label,
  hint,
  error,
  className = "",
  id,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}{props.required ? " *" : ""}
        </label>
      )}

      <textarea
        id={textareaId}
        {...props}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={[props["aria-describedby"], hint ? `${textareaId}-hint` : "", error ? `${textareaId}-error` : ""].filter(Boolean).join(" ") || undefined}
        className={cn(
          "w-full rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--erp-brand)] focus:ring-2 focus:ring-[var(--erp-brand-soft)] disabled:cursor-not-allowed disabled:bg-slate-100",
          className,
        )}
      />
      {hint && <p id={`${textareaId}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${textareaId}-error`} className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
