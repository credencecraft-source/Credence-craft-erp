"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { createPriceListTypeRecordAction } from "../type/[priceListType]/create/actions";

type ActionState = { error: string | null; successToken?: number; groupId?: string };

export default function PriceListContactCreateDialog({
  open,
  workspaceId,
  organizationId,
  priceListType,
  onClose,
  onCreated,
}: {
  open: boolean;
  workspaceId: string;
  organizationId: string;
  priceListType: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createPriceListTypeRecordAction, { error: null } satisfies ActionState);
  const [groupName, setGroupName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.successToken) return;
    onCreated();
    if (state.groupId) {
      router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/price-list/type/${encodeURIComponent(priceListType)}/${encodeURIComponent(state.groupId)}`);
    }
  }, [organizationId, onCreated, priceListType, router, state.groupId, state.successToken, workspaceId]);

  const closeDialog = () => {
    if (!isPending) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      ariaLabelledBy="price-list-group-create-title"
      ariaDescribedBy="price-list-group-create-description"
      initialFocusRef={inputRef}
      size="square"
    >
      <form action={formAction} className="space-y-5 p-6">
        <div>
          <h2 id="price-list-group-create-title" className="text-lg font-semibold text-[var(--erp-text)]">
            Add {priceListType} Group
          </h2>
          <p id="price-list-group-create-description" className="mt-1 text-sm text-[var(--erp-muted)]">
            Enter a group name.
          </p>
        </div>

        <Input
          ref={inputRef}
          name="groupName"
          label="Group Name"
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
          placeholder="Enter group name"
          disabled={isPending}
          required
        />

        {state.error ? <p className="text-sm text-[var(--erp-danger)]" role="alert">{state.error}</p> : null}

        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="priceListType" value={priceListType} />
        <input type="hidden" name="inlineCreate" value="true" />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={closeDialog} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!groupName.trim() || isPending}>
            {isPending ? "Creating..." : "Create Group"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
