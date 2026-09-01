"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";

type Option = {
  key: string;
  label: string;
  pathSegment: string;
};

export function MasterModuleSwitcher({
  value,
  options,
}: {
  value: string;
  options: ReadonlyArray<Option>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ref = useRef<HTMLDivElement>(null);

  const selected =
    options.find((o) => o.key === value)?.label ?? "Select Module";

  const getPath = (pathSegment: string) => {
    const segments = pathname.split("/").filter(Boolean);
    const orgIndex = segments.indexOf("organizations");

    if (orgIndex === -1) return `/${pathSegment}`;

    const base = segments.slice(0, orgIndex + 2).join("/");

    return `/${base}/${pathSegment}`;
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 min-w-[180px] items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          {isPending && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}

          {selected}
        </span>

        <ChevronDown
          className={`h-4 w-4 transition ${
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
                    router.push(getPath(option.pathSegment));
                  });
                }}
                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${
                  active
                    ? "bg-emerald-50 font-semibold text-emerald-700"
                    : "hover:bg-slate-100"
                }`}
              >
                {option.label}

                {active && (
                  <Check className="h-4 w-4" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
