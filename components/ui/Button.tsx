import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "danger" | "card";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      "border border-[var(--erp-brand)] bg-[var(--erp-brand)] text-white shadow-sm hover:bg-[var(--erp-brand-hover)] focus-visible:ring-[var(--erp-brand)]",
    secondary:
      "border border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-text)] shadow-sm hover:bg-[var(--erp-surface-soft)] focus-visible:ring-[var(--erp-brand)]",
    outline:
      "border border-[var(--erp-brand)] bg-transparent text-[var(--erp-brand)] shadow-sm hover:bg-[var(--erp-brand-soft)] focus-visible:ring-[var(--erp-brand)]",
    destructive:
      "border border-[var(--erp-danger)] bg-[var(--erp-danger)] text-white shadow-sm hover:bg-[var(--erp-danger-hover)] focus-visible:ring-[var(--erp-danger)]",
    danger:
      "border border-[var(--erp-danger)] bg-[var(--erp-danger)] text-white shadow-sm hover:bg-[var(--erp-danger-hover)] focus-visible:ring-[var(--erp-danger)]",
    ghost:
      "border border-transparent bg-transparent text-[var(--erp-text)] hover:bg-[var(--erp-surface-soft)] focus-visible:ring-[var(--erp-brand)]",
    card:
      "flex-col items-stretch justify-start rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] text-left text-[var(--erp-text)] shadow-sm hover:border-[var(--erp-brand)] hover:bg-[var(--erp-surface)] hover:shadow-md focus-visible:ring-[var(--erp-brand)]",
  };

  const sizes = {
    sm: "min-h-8 px-3 py-1.5 text-xs",
    md: "min-h-9 px-3.5 py-2 text-sm",
    lg: "min-h-10 px-4 py-2.5 text-sm",
  };

  return (
    <button
      type={type}
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
