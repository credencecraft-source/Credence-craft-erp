"use client";

import { useState } from "react";
import { RefreshCw, Sparkles, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

export default function OrganizationDummyDataActions({
  active,
  available,
  createAction,
  deleteAction,
  recreateAction,
}: {
  active: boolean;
  available: boolean;
  createAction: () => Promise<void>;
  deleteAction: () => Promise<void>;
  recreateAction: () => Promise<void>;
}) {
  const [confirmRecreate, setConfirmRecreate] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <form action={createAction}>
          <Button type="submit" disabled={active || !available}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {active ? "Dummy Data Created" : "Create Dummy Data"}
          </Button>
        </form>
        {active && available ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmRecreate(true)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Recreate Dummy Data (TEST ONLY)
            </Button>
            <form action={deleteAction}>
              <Button type="submit" variant="danger">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete Dummy Data
              </Button>
            </form>
          </>
        ) : null}
      </div>

      <Modal
        open={confirmRecreate}
        onClose={() => setConfirmRecreate(false)}
        ariaLabel="Confirm dummy-data recreation"
        variant="danger"
        size="sm"
        className="p-5"
      >
        <form action={recreateAction} className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recreate demo data for testing?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This replaces the current demo batch, including sample orders and procurement records. It is blocked if a Purchase Order or approval request was reviewed, or a PO was shared, received, or used by a gate entry.
            </p>
            <p className="mt-2 text-xs font-semibold text-amber-700">Temporary test-only action. Remove this button after validation.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmRecreate(false)}>Cancel</Button>
            <Button type="submit" variant="danger">Recreate demo batch</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}