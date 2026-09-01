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
}

export default function Modal({
  open,
  onClose,
  children,
  className,
  ariaLabel = "Dialog",
  closeOnBackdrop = true,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        aria-label={ariaLabel}
        aria-modal="true"
        className={cn("w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl sm:p-6", className)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}
