import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface PageProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: "main" | "div";
}

export default function Page({
  as: Component = "main",
  children,
  className = "",
  ...props
}: PageProps) {
  return (
    <Component {...props} className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8", className)}>
      {children}
    </Component>
  );
}
