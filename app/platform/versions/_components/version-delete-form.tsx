"use client";

import Button from "@/components/ui/Button";

export default function VersionDeleteForm({
  versionId,
  versionName,
  action,
}: {
  versionId: string;
  versionName: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete version "${versionName}"? This action cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={versionId} />
      <Button type="submit" variant="destructive" size="sm">
        Delete
      </Button>
    </form>
  );
}
