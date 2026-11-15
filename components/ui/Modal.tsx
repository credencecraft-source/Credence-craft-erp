"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utilities/utility-helpers";

type ModalProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocus?: boolean;
  closeOnBackdrop?: boolean;
  variant?: "default" | "success" | "danger" | "info";
  size?: "square" | "rectangle" | "sm" | "md" | "lg" | "xl" | "2xl";
} & (
  | { onClose: () => void; closeHref?: never }
  | { closeHref: string; onClose?: never }
);

export const MODAL_SIZE_CLASSES = {
  square: "aspect-square max-w-[40rem]",
  rectangle: "aspect-[4/3] max-w-[72rem]",
  sm: "aspect-square max-w-[40rem]",
  md: "aspect-square max-w-[40rem]",
  lg: "aspect-square max-w-[40rem]",
  xl: "aspect-[4/3] max-w-[72rem]",
  "2xl": "aspect-[4/3] max-w-[72rem]",
} as const;

export default function Modal({
  open,
  onClose,
  closeHref,
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
  const router = useRouter();

  const closeDialog = () => {
    if (closeHref) {
      router.push(closeHref);
      return;
    }
    onClose?.();
  };

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
      closeDialog();
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 backdrop-blur-[2px] sm:items-center"
      onClick={closeOnBackdrop ? closeDialog : undefined}
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
        data-variant={variant}
        className={cn(className, "erp-popup-panel h-auto min-h-0 max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto bg-white", MODAL_SIZE_CLASSES[size])}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
