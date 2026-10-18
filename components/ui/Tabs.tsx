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
  cardStyle?: boolean;
}

export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel = "Tabs",
  scrollable = false,
  compact = false,
  cardStyle = false,
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
        "flex w-full min-w-0 max-w-full",
        cardStyle
          ? "items-stretch gap-3"
          : "items-center rounded-xl border border-slate-200/80 bg-slate-100/80 shadow-inner shadow-slate-900/[0.02]",
        !cardStyle && (compact ? "gap-1 p-0.5" : "gap-1.5 p-1"),
        scrollable ? "flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "flex-wrap",
      )}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab, index) => (
        <Button
          variant={cardStyle ? "card" : "ghost"}
          key={tab.value}
          id={tab.id ?? `${idPrefix}-tab-${index}`}
          aria-selected={value === tab.value}
          aria-controls={tab.panelId}
          role="tab"
          tabIndex={value === tab.value ? 0 : -1}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2",
            cardStyle
              ? "min-h-[4.5rem] min-w-[7.5rem] flex-1 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-center"
              : "shrink-0 rounded-lg border border-transparent",
            !cardStyle && (compact ? "min-h-8 px-2.5 py-1 text-xs" : "min-h-10 px-3.5 py-2 text-sm"),
            cardStyle
              ? value === tab.value
                ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-[var(--erp-brand)] ring-1 ring-[var(--erp-brand)]/20"
                : "text-[var(--erp-text)]"
              : value === tab.value
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