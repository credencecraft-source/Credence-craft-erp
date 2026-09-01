import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface SidebarProps extends ComponentPropsWithoutRef<"aside"> {
  children: ReactNode;
}

export default function Sidebar({
  children,
  className = "",
  ...props
}: SidebarProps) {
  return (
    <aside
      {...props}
      className={cn("min-h-screen w-64 border-r border-slate-200 bg-white p-4", className)}
    >
      {children}
    </aside>
  );
}
