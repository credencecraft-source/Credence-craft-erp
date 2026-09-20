"use client";

import { useId } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

export interface Tab {
  label: string;
  value: string;
  panelId?: string;
}

interface TabsProps {
  tabs: readonly Tab[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export default function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel = "Tabs",
}: TabsProps) {
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
    document.getElementById(`${idPrefix}-tab-${nextIndex}`)?.focus();
  };

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          id={`${idPrefix}-tab-${index}`}
          aria-selected={value === tab.value}
          aria-controls={tab.panelId}
          role="tab"
          tabIndex={value === tab.value ? 0 : -1}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            // CHANGE text-sm to text-xs HERE:
            "shrink-0 border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2",
            value === tab.value
              ? "border-emerald-600 text-emerald-800"
              : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}