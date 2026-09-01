import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface NavbarProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  children?: ReactNode;
}

export default function Navbar({
  title,
  children,
  className = "",
  ...props
}: NavbarProps) {
  return (
    <header
      {...props}
      className={cn("flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6", className)}
    >
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">{children}</div>
    </header>
  );
}
