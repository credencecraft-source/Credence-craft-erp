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
    <Component {...props} className={cn("erp-page-container mx-auto w-full min-w-0 max-w-[1500px] p-4 lg:p-8", className)}>
      {children}
    </Component>
  );
}
