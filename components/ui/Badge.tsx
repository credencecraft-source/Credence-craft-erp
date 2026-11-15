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
    <span
      {...props}
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--erp-brand-soft)] bg-[var(--erp-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--erp-brand)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
