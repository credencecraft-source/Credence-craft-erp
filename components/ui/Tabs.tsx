"use client";

import { cn } from "@/lib/utilities/utility-helpers";

export interface Tab {
  label: string;
  value: string;
}

interface TabsProps {
  tabs: readonly Tab[];
  value: string;
  onChange: (value: string) => void;
}

export default function Tabs({
  tabs,
  value,
  onChange,
}: TabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          aria-selected={value === tab.value}
          role="tab"
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