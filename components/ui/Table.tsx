import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface TableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Table({
  children,
  className = "",
  ...props
}: TableProps) {
  return (
    <div {...props} className={cn("overflow-x-auto rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-[var(--erp-shadow)]", className)}>
      <table className="min-w-full divide-y divide-[var(--erp-border)] text-left text-sm">
        {children}
      </table>
    </div>
  );
}
