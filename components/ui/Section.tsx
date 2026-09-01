import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export default function Section({
  children,
  className = "",
  ...props
}: SectionProps) {
  return (
    <section {...props} className={cn("space-y-4", className)}>
      {children}
    </section>
  );
}
