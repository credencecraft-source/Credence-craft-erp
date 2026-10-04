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