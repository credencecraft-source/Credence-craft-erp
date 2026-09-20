"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { cn } from "@/lib/utilities/utility-helpers";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocus?: boolean;
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
  ariaLabelledBy,
  ariaDescribedBy,
  initialFocusRef,
  returnFocus = true,
  closeOnBackdrop = true,
  variant = "default",
  size = "md",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    (focusTarget ?? dialogRef.current)?.focus();

    return () => {
      if (returnFocus) restoreFocusRef.current?.focus();
    };
  }, [initialFocusRef, open, returnFocus]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

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
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        className={cn("w-full overflow-hidden rounded-2xl border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]", variants[variant], sizes[size], className)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}
