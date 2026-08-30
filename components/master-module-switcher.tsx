"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Check, Loader2 } from "lucide-react";

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
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((opt) => opt.key === value)?.label || "Select Module";

  const getModulePath = (nextValue: string) => {
    const segments = pathname.split("/").filter(Boolean);
    const orgIndex = segments.indexOf("organizations");

    if (orgIndex === -1) return `/${nextValue}`;

    const basePath = segments.slice(0, orgIndex + 2).join("/");
    return basePath ? `/${basePath}/${nextValue}` : `/${nextValue}`;
  };

  // Prefetch module routes when user interacts with the dropdown trigger
  const prefetchRoutes = () => {
    options.forEach((module) => {
      if (module.key !== value) {
        router.prefetch(getModulePath(module.key));
      }
    });
  };

  const handleSelect = (nextValue: string) => {
    setIsOpen(false);
    if (nextValue === value) return;

    const nextPath = getModulePath(nextValue);

    // Non-blocking navigation transition
    startTransition(() => {
      router.push(nextPath);
    });
  };

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
        onMouseEnter={prefetchRoutes}
        onFocus={prefetchRoutes}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-7 items-center justify-between gap-2 rounded border bg-white px-2.5 text-[11px] font-semibold text-slate-800 shadow-2xs transition-all ${
          isOpen
            ? "border-emerald-600 ring-2 ring-emerald-600/10 text-emerald-950"
            : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        }`}
      >
        <span className="flex items-center gap-1.5">
          {isPending && <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />}
          <span>{selectedLabel}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-emerald-700" : ""
          }`}
        />
      </button>

      {/* DROPDOWN MENU */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg font-sans">
          <div className="space-y-0.5">
            {options.map((module) => {
              const isSelected = module.key === value;
              return (
                <button
                  key={module.key}
                  type="button"
                  onMouseEnter={() => router.prefetch(getModulePath(module.key))}
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