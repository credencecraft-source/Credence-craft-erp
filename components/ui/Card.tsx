import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Card({
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div {...props} className={cn("rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)]", className)}>
      {children}
    </div>
  );
}
