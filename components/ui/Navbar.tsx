import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface NavbarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
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
      className={cn("flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 sm:px-6", className)}
    >
      <div className="min-w-0 flex-1 basis-64">{title}</div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </header>
  );
}
