"use client";

import { Check } from "lucide-react";
import Button from "@/components/ui/Button";

export default function StageButton({
  number,
  label,
  active,
  disabled,
  onClick,
  onMouseEnter,
  onFocus,
  icon: Icon,
}: {
  number: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  icon: typeof Check;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
        active
          ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] hover:bg-[var(--erp-brand-soft)]"
          : "border-slate-200 bg-slate-50 hover:border-[var(--erp-brand)] hover:bg-[var(--erp-brand-soft)]"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-[var(--erp-brand)] text-white" : "bg-slate-200 text-slate-600"}`}
      >
        {number}
      </span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="truncate text-[10px] font-semibold text-slate-700">
        {label}
      </span>
    </Button>
  );
}
