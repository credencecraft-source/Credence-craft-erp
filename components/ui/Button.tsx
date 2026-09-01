import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
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
      "border border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-emerald-600",
    secondary:
      "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:ring-slate-500",
    danger:
      "border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-600",
    ghost:
      "border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-500",
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
