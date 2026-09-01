import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export default function Badge({
  children,
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span {...props} className={cn("inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800", className)}>
      {children}
    </span>
  );
}
