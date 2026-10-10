"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import NavigationLoadingOverlay from "@/components/ui/NavigationLoadingOverlay";

export default function NavigationLinkStatus({
  expanded,
  label,
  showOverlay = false,
}: {
  expanded: boolean;
  label?: string;
  showOverlay?: boolean;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      {pending && showOverlay && (
        <NavigationLoadingOverlay label={label ? `Opening ${label}` : undefined} />
      )}
      <span
        role="status"
        aria-live="polite"
        className={expanded
          ? `hidden w-14 shrink-0 text-right text-[10px] text-slate-300 transition-opacity group-data-[expanded=true]:inline-block ${pending ? "opacity-100" : "opacity-0"}`
          : "sr-only"}
      >
        {pending ? "Opening…" : ""}
      </span>
      <LoaderCircle
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 animate-spin text-brand-400 transition-opacity ${
          pending ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}
