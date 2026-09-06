"use client";

import {
  ComponentPropsWithoutRef,
  ReactNode,
  useState,
} from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface SidebarProps extends ComponentPropsWithoutRef<"aside"> {
  children: ReactNode;
}

export default function Sidebar({
  children,
  className,
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
        "min-h-screen border-r border-slate-200 bg-white transition-all duration-300 ease-in-out overflow-hidden",
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