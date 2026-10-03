"use client";

import Button from "@/components/ui/Button";

export default function OrganizationDeleteControl({
  organizationName,
  deleteAction,
  disabled,
}: {
  organizationName: string;
  deleteAction: () => Promise<void>;
  disabled: boolean;
}) {
  return (
    <form
      action={deleteAction}
      onSubmit={(event) => {
        if (!window.confirm(`Permanently delete ${organizationName} and all related business records? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <Button
        type="submit"
        variant="danger"
        size="sm"
        className="rounded-md"
        disabled={disabled}
        aria-describedby="organization-delete-retention"
      >
        Delete Organisation
      </Button>
    </form>
  );
}
