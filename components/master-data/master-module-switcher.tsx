"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, LogOut } from "lucide-react";
import Button from "@/components/ui/Button";
import NavigationLoadingOverlay from "@/components/ui/NavigationLoadingOverlay";

type Option = {
  key: string;
  label: string;
  pathSegment?: string;
  href?: string;
  moduleKey?: string;
  children?: ReadonlyArray<Option>;
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
  const prefetchedRoutesRef = useRef(new Set<string>());

  const selectedOption = options.find((o) => o.key === value);
  const selectedLabel = selectedOption?.label ?? "Select Module";

  const getPath = (option: Option) => {
    const segments = pathname.split("/").filter(Boolean);
    const orgIndex = segments.indexOf("organizations");
    const base = orgIndex === -1 ? "" : `/${segments.slice(0, orgIndex + 2).join("/")}`;

    const pathSegments = [option.pathSegment || option.key];
    let currentOption: Option | undefined = option;
    while (currentOption?.children?.[0]) {
      const firstChild: Option = currentOption.children[0];
      if (firstChild.href) {
        const href = firstChild.href.startsWith("/") ? firstChild.href : `/${firstChild.href}`;
        return `${base}${href}`;
      }
      pathSegments.push(firstChild.pathSegment || firstChild.key);
      currentOption = firstChild;
    }
    const subPath = pathSegments.join("/");

    return `${base}/${subPath}`;
  };

  const prefetchOption = (option: Option) => {
    const href = getPath(option);
    if (prefetchedRoutesRef.current.has(href)) return;
    prefetchedRoutesRef.current.add(href);
    router.prefetch(href);
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
      {isPending && <NavigationLoadingOverlay label="Loading organization module" />}
      {/* Module Switcher Dropdown */}
      <div ref={ref} className="relative" aria-busy={isPending}>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 min-w-[180px] items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-sm font-medium cursor-pointer shadow-2xs hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2 uppercase">
            {selectedLabel}
          </span>

          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </Button>

        {open && (
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-slate-200 bg-white p-1 shadow-xl">
            {options.map((option) => {
              const active = option.key === value;

              return (
                <Button
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  key={option.key}
                  type="button"
                  disabled={isPending}
                  onMouseEnter={() => prefetchOption(option)}
                  onFocus={() => prefetchOption(option)}
                  onClick={() => {
                    if (isPending) return;
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
                  <span className="uppercase">{option.label}</span>
                  {active && <Check className="h-4 w-4 text-emerald-600" />}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Header-Level Logout Button */}
      <Button
        variant="danger"
        size="sm"
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
      </Button>
    </div>
  );
}