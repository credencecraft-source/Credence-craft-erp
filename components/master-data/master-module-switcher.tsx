"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, LogOut } from "lucide-react";

type Option = {
  key: string;
  label: string;
  pathSegment?: string;
  moduleKey?: string;
  children?: ReadonlyArray<{
    key: string;
    label: string;
    pathSegment?: string;
    children?: ReadonlyArray<{
      key: string;
      label: string;
      pathSegment?: string;
    }>;
  }>;
};

export function MasterModuleSwitcher({
  value,
  options,
  onLogout,
}: {
  value: string;
  options: ReadonlyArray<Option>;
  onLogout?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.key === value);
  const selectedLabel = selectedOption?.label ?? "Select Module";

  const getPath = (option: Option) => {
    const segments = pathname.split("/").filter(Boolean);
    const orgIndex = segments.indexOf("organizations");

    const pathSegments = [option.pathSegment || option.key];
    let currentOption: any = option;
    while (currentOption.children?.[0]) {
      const firstChild = currentOption.children[0];
      pathSegments.push(firstChild.pathSegment || firstChild.key);
      currentOption = firstChild;
    }
    const subPath = pathSegments.join("/");

    if (orgIndex === -1) return `/${subPath}`;

    const base = segments.slice(0, orgIndex + 2).join("/");
    return `/${base}/${subPath}`;
  };

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("mousedown", close);
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      {/* Module Switcher Dropdown */}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 min-w-[180px] items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-sm font-medium cursor-pointer shadow-2xs hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            {isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            )}
            {selectedLabel}
          </span>

          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>

        {open && (
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-slate-200 bg-white p-1 shadow-xl">
            {options.map((option) => {
              const active = option.key === value;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (active) return;

                    startTransition(() => {
                      router.push(getPath(option));
                    });
                  }}
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm cursor-pointer ${
                    active
                      ? "bg-emerald-50 font-semibold text-emerald-700"
                      : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <span>{option.label}</span>
                  {active && <Check className="h-4 w-4 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Header-Level Logout Button */}
      <button
        type="button"
        disabled={isLoggingOut}
        onClick={() => {
          startLogoutTransition(async () => {
            if (onLogout) {
              await onLogout();
            } else {
              router.push("/");
            }
          });
        }}
        className="flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-red-50/50 px-3 text-xs font-semibold text-red-600 shadow-2xs hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
      >
        {isLoggingOut ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
        ) : (
          <LogOut className="h-3.5 w-3.5" />
        )}
        Logout
      </button>
    </div>
  );
}