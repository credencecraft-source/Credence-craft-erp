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
    <div {...props} className={cn("overflow-x-auto rounded-xl border border-slate-200 bg-white", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        {children}
      </table>
    </div>
  );
}
