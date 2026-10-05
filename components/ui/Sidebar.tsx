"use client";

import type { SegmentRestriction } from "@prisma/client";
import {
  ComponentPropsWithoutRef,
  ReactNode,
  useState,
} from "react";
import { cn } from "@/lib/utilities/utility-helpers";

interface SidebarProps extends ComponentPropsWithoutRef<"aside"> {
  children: ReactNode;
  restrictions?: SegmentRestriction[];
  organizationId?: string;
}

export default function Sidebar({
  children,
  className,
  ...props
}: SidebarProps) {
  const asideProps = { ...props };
  delete asideProps.restrictions;
  delete asideProps.organizationId;
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      {...asideProps}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      data-expanded={expanded}
      className={cn(
        "h-full min-h-0 min-w-0 max-w-full shrink-0 overflow-hidden border-r border-[var(--erp-border)] bg-[var(--erp-surface)] shadow-[var(--erp-shadow)] transition-all duration-300 ease-in-out",
        expanded ? "w-64" : "w-16",
        className
      )}
    >
      <div className="h-full min-h-0 overflow-y-auto p-4">
        {children}
      </div>
    </aside>
  );
}