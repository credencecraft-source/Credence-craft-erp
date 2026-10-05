"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";
import Button from "@/components/ui/Button";


export interface Tab<T extends string = string> {
  id?: string;
  label: ReactNode;
  value: T;
  panelId?: string;
}

interface TabsProps<T extends string> {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  scrollable?: boolean;
  compact?: boolean;
}

export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel = "Tabs",
  scrollable = false,
  compact = false,
}: TabsProps<T>) {
  const idPrefix = useId();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!tabs.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = Math.max(0, tabs.findIndex((tab) => tab.value === value));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].value);
    document.getElementById(tabs[nextIndex].id ?? `${idPrefix}-tab-${nextIndex}`)?.focus();
  };

  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full items-center rounded-xl border border-slate-200/80 bg-slate-100/80 shadow-inner shadow-slate-900/[0.02]",
        compact ? "gap-1 p-0.5" : "gap-1.5 p-1",
        scrollable ? "flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "flex-wrap",
      )}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab, index) => (
        <Button
          variant="ghost"
          key={tab.value}
          id={tab.id ?? `${idPrefix}-tab-${index}`}
          aria-selected={value === tab.value}
          aria-controls={tab.panelId}
          role="tab"
          tabIndex={value === tab.value ? 0 : -1}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "shrink-0 rounded-lg border border-transparent font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2",
            compact ? "min-h-8 px-2.5 py-1 text-xs" : "min-h-10 px-3.5 py-2 text-sm",
            value === tab.value
              ? "border-white bg-white text-[var(--erp-brand)] shadow-sm ring-1 ring-slate-900/[0.04]"
              : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
          )}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}