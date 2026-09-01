import { useId, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export default function Textarea({
  label,
  hint,
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
          {label}
        </label>
      )}

      <textarea
        id={textareaId}
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
