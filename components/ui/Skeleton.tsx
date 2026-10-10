import { cn } from "@/lib/utilities/utility-helpers";

export default function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded bg-[var(--erp-border)]", className)}
    />
  );
}
