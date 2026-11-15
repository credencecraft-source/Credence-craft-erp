import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

export default function Switch({
  checked,
  label,
  onCheckedChange,
  disabled,
  className = "",
  ...props
}: SwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--erp-brand)]" : "bg-slate-300",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
