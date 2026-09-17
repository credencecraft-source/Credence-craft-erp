"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
  variant?: "default" | "success" | "danger" | "info";
  size?: "sm" | "md" | "lg" | "xl";
}

export default function Modal({
  open,
  onClose,
  children,
  className,
  ariaLabel = "Dialog",
  closeOnBackdrop = true,
  variant = "default",
  size = "md",
}: ModalProps) {
  if (!open) return null;

  const variants = {
    default: "border-slate-200",
    success: "border-emerald-200",
    danger: "border-rose-200",
    info: "border-sky-200",
  };
  const sizes = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-5xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        aria-label={ariaLabel}
        aria-modal="true"
        className={cn("w-full overflow-hidden rounded-2xl border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]", variants[variant], sizes[size], className)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}
