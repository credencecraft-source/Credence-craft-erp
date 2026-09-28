"use client";

import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

export default function OrganizationDummyDataActions({
  active,
  available,
  createAction,
  deleteAction,
}: {
  active: boolean;
  available: boolean;
  createAction: () => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete Dummy Data
          </Button>
        ) : null}
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        ariaLabel="Confirm dummy-data deletion"
        variant="danger"
        size="sm"
        className="p-5"
      >
        <form action={deleteAction} className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Delete dummy data?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This removes the sample order and only the master records created for this demo batch. Organization setup and existing master values are preserved.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button type="submit" variant="danger">Delete demo batch</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}