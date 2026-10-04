"use client";

import Button from "@/components/ui/Button";

export default function OrganizationDeleteControl({
  organizationName,
  deleteAction,
  forceDeleteAction,
  disabled,
}: {
  organizationName: string;
  deleteAction: () => Promise<void>;
  forceDeleteAction: (formData: FormData) => Promise<void>;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
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
      <form
        action={forceDeleteAction}
        onSubmit={(event) => {
          if (!window.confirm(`Force delete ${organizationName}, bypassing the archive and retention requirements? All related business records will also be permanently deleted.`)) {
            event.preventDefault();
            return;
          }

          const confirmation = window.prompt(`Type "${organizationName}" to confirm force deletion.`);
          if (confirmation?.trim() !== organizationName) {
            event.preventDefault();
            window.alert("The organisation name did not match. Force deletion was cancelled.");
            return;
          }

          const confirmationField = event.currentTarget.elements.namedItem("confirmationName");
          if (!(confirmationField instanceof HTMLInputElement)) {
            event.preventDefault();
            return;
          }
          confirmationField.value = confirmation.trim();
        }}
      >
        <input type="hidden" name="confirmationName" />
        <Button
          type="submit"
          variant="danger"
          size="sm"
          className="rounded-md"
          aria-describedby="organization-force-delete-warning"
        >
          Force Delete Organisation
        </Button>
      </form>
    </div>
  );
}
