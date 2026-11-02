"use client";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";

type ContactOption = {
  id: string;
  label: string;
  contactId?: string;
};

export type AdvanceBookingContactLookupDialogProps = {
  isCreatingQuotation: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  selectedContactId: string;
  onContactChange: (value: string) => void;
  contacts: ContactOption[] | null;
  isLoadingContacts: boolean;
  contactsError: string;
  onRetry: () => void;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
};

export default function AdvanceBookingContactLookupDialog({
  isCreatingQuotation,
  search,
  onSearchChange,
  selectedContactId,
  onContactChange,
  contacts,
  isLoadingContacts,
  contactsError,
  onRetry,
  error,
  onSubmit,
  onClose,
}: AdvanceBookingContactLookupDialogProps) {
  return (
    <Modal
      open
      onClose={() => {
        if (!isCreatingQuotation) onClose();
      }}
      ariaLabelledBy="quotation-vendor-title"
      size="sm"
      closeOnBackdrop={!isCreatingQuotation}
    >
      <form
        className="space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <header className="space-y-1">
          <h2 id="quotation-vendor-title" className="text-lg font-semibold text-slate-900">Confirm Order Form</h2>
          <p className="text-sm text-slate-600">Select the Contact name for this Order Form.</p>
        </header>
        <Input
          label="Search Contact Master"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name or code"
          disabled={isCreatingQuotation}
        />
        <Select
          label="Contact Name"
          required
          value={selectedContactId}
          onChange={(event) => onContactChange(event.target.value)}
          options={[
            {
              label: isLoadingContacts ? "Searching contacts..." : "Select a Contact",
              value: "",
            },
            ...(contacts ?? []).map((contact) => ({
              label: contact.label,
              value: `contact:${contact.contactId ?? contact.id}`,
            })),
          ]}
          disabled={isLoadingContacts || isCreatingQuotation}
        />
        {contactsError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
            <span>{contactsError}</span>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry} disabled={isLoadingContacts}>
              Retry Contact Search
            </Button>
          </div>
        ) : null}
        {contacts?.length === 0 && !isLoadingContacts && !contactsError ? (
          <p role="status" className="text-sm text-slate-600">No contacts are available in Contact Master.</p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <footer className="flex justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isCreatingQuotation}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!selectedContactId || isLoadingContacts || isCreatingQuotation}
          >
            {isCreatingQuotation ? "Creating..." : "Submit Order Form"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
