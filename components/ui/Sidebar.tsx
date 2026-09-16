"use client";

import {
  ComponentPropsWithoutRef,
  ReactNode,
  useState,
} from "react";
import { cn } from "@/lib/utilities/utility-helpers";

interface SidebarProps extends ComponentPropsWithoutRef<"aside"> {
  children: ReactNode;
  restrictions?: any[];
  organizationId?: string;
}

export default function Sidebar({
  children,
  className,
  restrictions = [],
  organizationId = "",
  ...props
}: SidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      {...props}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      data-expanded={expanded}
      className={cn(
        "min-h-screen border-r border-[var(--erp-border)] bg-[var(--erp-surface)] transition-all duration-300 ease-in-out overflow-hidden shadow-[var(--erp-shadow)]",
        expanded ? "w-64" : "w-16",
        className
      )}
    >
      <div className="h-full p-4">
        {children}
      </div>
    </aside>
  );
}