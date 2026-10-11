"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ContactMasterExcelActions from "@/components/master-data/contact-master-excel-actions";
import { ReportGrid } from "@/components/reports/report-grid-display";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook";

type ContactRecord = ContactWorkbookRecord;

const CONTACT_REPORT_FIELDS = [
  { key: "contact", label: "Contact" },
  { key: "roles", label: "Roles" },
  { key: "gstins", label: "GSTINs" },
  { key: "addresses_banks", label: "Addresses / banks" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions" },
];

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer",
  VENDOR: "Vendor",
  AGENT: "Agent",
  DISTRIBUTOR: "Distributor",
  DEALER: "Dealer",
};

export default function ContactMasterManager({ organizationId, workspaceId }: { organizationId: string; workspaceId: string }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [search, setSearch] = useState("");
  const [visibleFields, setVisibleFields] = useState<string[]>(CONTACT_REPORT_FIELDS.map(({ key }) => key));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/contacts`;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts`;

  const loadContacts = useCallback(async (query: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}${query ? `?search=${encodeURIComponent(query)}` : ""}`);
      const data = await response.json() as ContactRecord[] | { error?: string };
      if (!response.ok) throw new Error(!Array.isArray(data) ? data.error ?? "Unable to load contacts." : "Unable to load contacts.");
      setContacts(data as ContactRecord[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(search), 200);
    return () => window.clearTimeout(timer);
  }, [loadContacts, search]);

  const deactivateContact = async (contact: ContactRecord) => {
    if (!window.confirm(`Deactivate ${contact.display_name || contact.legal_name}?`)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to deactivate contact.");
      setNotice("Contact deactivated. Existing documents are unchanged.");
      await loadContacts(search);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : "Unable to deactivate contact.");
    }
  };

  const workbookContacts = contacts.map(({ roles, ...contact }) => ({
    ...contact,
    roles: roles.map((role) => ({ role_code: role.role_code })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/VENDORS`} className="text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline">
            Back to Vendors and Contacts
          </Link>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--erp-brand)]">Master data</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--erp-text)]">Unified Contact Master</h1>
          <p className="mt-2 text-sm text-slate-600">One contact can hold multiple business roles, GST registrations, addresses, and bank accounts.</p>
        </div>
        <Button onClick={() => router.push(`${basePath}/new`)}><Plus aria-hidden="true" className="h-4 w-4" /> New contact</Button>
      </div>

      {error ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-success)]" role="status">{notice}</p> : null}

      <ReportGrid
        title="Contact records"
        records={contacts}
        fields={CONTACT_REPORT_FIELDS}
        visibleFields={visibleFields}
        onVisibleFieldsChange={(fields) => setVisibleFields(fields.map(String))}
        storageKey={`contact-master-report-columns-${organizationId}`}
        rowIdSelector={(contact) => contact.id}
        selectedIds={[]}
        selectable={false}
        onRowClick={(contactId) => router.push(`${basePath}/${encodeURIComponent(contactId)}`)}
        toolbarActions={<ContactMasterExcelActions contacts={workbookContacts} endpoint={endpoint} />}
        onSearchQueryChange={setSearch}
        getSearchValue={(fieldKey, contact) => {
          switch (fieldKey) {
            case "contact":
              return `${contact.code} ${contact.display_name ?? ""} ${contact.legal_name}`;
            case "roles":
              return contact.roles.map(({ role_code }) => ROLE_LABELS[role_code] ?? role_code).join(" ");
            case "gstins":
              return contact.tax_registrations.map(({ gstin }) => gstin).join(" ");
            case "addresses_banks":
              return `${contact.addresses.length} ${contact.bank_accounts.length}`;
            case "status":
              return contact.is_active ? "active" : "inactive";
            default:
              return "";
          }
        }}
        renderCell={(fieldKey, contact) => {
          switch (fieldKey) {
            case "contact":
              return (
                <div>
                  <span className="font-semibold">{contact.display_name || contact.legal_name}</span>
                  <span className="mt-1 block text-xs text-slate-500">{contact.code}</span>
                </div>
              );
            case "roles":
              return contact.roles.map(({ role_code }) => ROLE_LABELS[role_code] ?? role_code).join(", ") || "—";
            case "gstins":
              return contact.tax_registrations.map(({ gstin }) => gstin).join(", ") || "—";
            case "addresses_banks":
              return `${contact.addresses.length} / ${contact.bank_accounts.length}`;
            case "status":
              return (
                <Badge
                  className={contact.is_active
                    ? "border-[var(--erp-success)] bg-[var(--erp-success-soft)] text-[var(--erp-success)]"
                    : "border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-slate-600"}
                >
                  {contact.is_active ? "Active" : "Inactive"}
                </Badge>
              );
            case "actions":
              return (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`${basePath}/${encodeURIComponent(contact.id)}`);
                    }}
                  >
                    Open
                  </Button>
                  {contact.is_active ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deactivateContact(contact);
                      }}
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              );
            default:
              return "";
          }
        }}
        isLoading={loading}
        emptyMessage={search ? "No matching contacts." : "No contacts yet. Create a contact to start assigning business roles and tax registrations."}
      />
    </div>
  );
}
