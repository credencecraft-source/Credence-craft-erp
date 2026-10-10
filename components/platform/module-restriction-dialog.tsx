"use client";

import { useState, type ReactNode } from "react";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface ModuleRestrictionDialogProps {
  children: ReactNode;
}

export default function ModuleRestrictionDialog({
  children,
}: ModuleRestrictionDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add module restriction
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Add module restriction" size="lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add module restriction</h2>
            <p className="mt-1 text-xs text-slate-500">Select the module hierarchy and restriction behavior.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close add module restriction dialog">
            Close
          </Button>
        </div>
        <div className="max-h-[min(72vh,760px)] overflow-y-auto p-6">
          {children}
        </div>
      </Modal>
    </>
  );
}
