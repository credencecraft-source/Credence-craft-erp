import { useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Checkbox({
  label,
  error,
  className = "",
  id,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2">
      <input
        id={checkboxId}
        type="checkbox"
        {...props}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={error ? `${checkboxId}-error` : props["aria-describedby"]}
        className={cn("h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500", className)}
      />
      {label && <span className="text-sm text-slate-700">{label}</span>}
      {error && <span id={`${checkboxId}-error`} className="text-xs font-medium text-red-700">{error}</span>}
    </label>
  );
}
