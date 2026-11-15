import type { HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface TableProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tableClassName?: string;
  containerRef?: Ref<HTMLDivElement>;
}

export default function Table({
  children,
  className = "",
  tableClassName = "",
  containerRef,
  ...props
}: TableProps) {
  return (
    <div {...props} ref={containerRef} className={cn("min-w-0 max-w-full overflow-x-auto rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-[var(--erp-shadow)]", className)}>
      <table className={cn("min-w-full divide-y divide-[var(--erp-border)] text-left text-sm", tableClassName)}>
        {children}
      </table>
    </div>
  );
}
