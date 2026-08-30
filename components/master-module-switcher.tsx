"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";

export function MasterModuleSwitcher({
  value,
  options,
}: {
  value: string;
  options: ReadonlyArray<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get label for current selected item
  const selectedLabel = options.find((opt) => opt.key === value)?.label || "Select Module";

  // Handle module routing
  const handleSelect = (nextValue: string) => {
    setIsOpen(false);
    if (nextValue === value) return;

    const segments = pathname.split("/").filter(Boolean);
    const organizationsIndex = segments.indexOf("organizations");

    if (organizationsIndex === -1) {
      router.push(`/${nextValue}`);
      return;
    }

    const basePath = segments.slice(0, organizationsIndex + 2).join("/");
    const nextPath = basePath ? `/${basePath}/${nextValue}` : `/${nextValue}`;
    router.push(nextPath);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-7 items-center justify-between gap-2 rounded border bg-white px-2.5 text-[11px] font-semibold text-slate-800 shadow-2xs transition-all ${
          isOpen
            ? "border-emerald-600 ring-2 ring-emerald-600/10 text-emerald-950"
            : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <span>{selectedLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-emerald-700" : ""
          }`}
        />
      </button>

      {/* FLOATING DROPDOWN MENU */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg font-sans">
          <div className="space-y-0.5">
            {options.map((module) => {
              const isSelected = module.key === value;
              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() => handleSelect(module.key)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] transition ${
                    isSelected
                      ? "bg-emerald-50 text-emerald-900 font-bold"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium"
                  }`}
                >
                  <span>{module.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-700" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}