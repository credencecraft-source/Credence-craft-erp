import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface TableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tableClassName?: string;
}

export default function Table({
  children,
  className = "",
  tableClassName = "",
  ...props
}: TableProps) {
  return (
    <div {...props} className={cn("min-w-0 max-w-full overflow-x-auto rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-[var(--erp-shadow)]", className)}>
      <table className={cn("min-w-full divide-y divide-[var(--erp-border)] text-left text-sm", tableClassName)}>
        {children}
      </table>
    </div>
  );
}
