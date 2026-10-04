"use client";

import Button from "@/components/ui/Button";

type PlatformAccessDeleteFormProps = {
  accountId: string;
  accountName: string;
  deleteAction: (formData: FormData) => Promise<void>;
};

export default function PlatformAccessDeleteForm({
  accountId,
  accountName,
  deleteAction,
}: PlatformAccessDeleteFormProps) {
  return (
    <form
      action={deleteAction}
      onSubmit={(event) => {
        if (!window.confirm(`Delete platform access for ${accountName}?`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <Button type="submit" size="sm" variant="danger">Delete</Button>
    </form>
  );
}
