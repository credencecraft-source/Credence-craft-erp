"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { ReportGrid } from "@/components/reports/report-grid-display";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook-parser";

type ContactRecord = ContactWorkbookRecord;

const CONTACT_REPORT_FIELDS = [
  { key: "contact", label: "Contact" },
  { key: "roles", label: "Roles" },
  { key: "gstins", label: "GSTIN" },
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

const CONTACT_PAGE_SIZE = 200;

export default function ContactMasterManager({ organizationId, workspaceId }: { organizationId: string; workspaceId: string }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [visibleFields, setVisibleFields] = useState<string[]>(CONTACT_REPORT_FIELDS.map(({ key }) => key));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const contactRequestSequence = useRef(0);
  const contactOffset = useRef(0);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);

  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/contacts`;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts`;

  const loadContacts = useCallback(async (query: string, signal?: AbortSignal, append = false) => {
    const requestSequence = ++contactRequestSequence.current;
    const offset = append ? contactOffset.current : 0;
    setLoading(true);
    setError("");
    try {
      const queryParams = new URLSearchParams({
        limit: String(CONTACT_PAGE_SIZE),
        offset: String(offset),
      });
      if (query) queryParams.set("search", query);
      const response = await fetch(
        `${endpoint}?${queryParams.toString()}`,
        { signal },
      );
      const data = await response.json() as ContactRecord[] | { error?: string };
      if (!response.ok) throw new Error(!Array.isArray(data) ? data.error ?? "Unable to load contacts." : "Unable to load contacts.");
      if (signal?.aborted || requestSequence !== contactRequestSequence.current) return;
      const loadedContacts = data as ContactRecord[];
      setContacts((current) => {
        if (!append) return loadedContacts;
        const existingIds = new Set(current.map(({ id }) => id));
        return [...current, ...loadedContacts.filter(({ id }) => !existingIds.has(id))];
      });
      contactOffset.current = offset + loadedContacts.length;
      setHasMoreContacts(loadedContacts.length === CONTACT_PAGE_SIZE);
    } catch (loadError) {
      if (signal?.aborted || requestSequence !== contactRequestSequence.current) return;
      if (loadError instanceof Error && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load contacts.");
    } finally {
      if (!signal?.aborted && requestSequence === contactRequestSequence.current) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadContacts(search, controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadContacts, search]);

  const deactivateContact = async (contact: ContactRecord) => {
    if (!window.confirm(`Deactivate ${contact.display_name || contact.legal_name}?`)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to deactivate contact.");
      setSelectedIds((current) => current.filter((id) => id !== contact.id));
      setNotice("Contact deactivated. Existing documents are unchanged.");
      await loadContacts(search);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : "Unable to deactivate contact.");
    }
  };

  const deactivateSelectedContacts = async () => {
    const activeIds = contacts
      .filter((contact) => selectedIds.includes(contact.id) && contact.is_active)
      .map((contact) => contact.id);
    if (activeIds.length === 0) {
      setNotice("No active selected contacts to deactivate.");
      return;
    }
    if (!window.confirm(`Deactivate ${activeIds.length} selected contact${activeIds.length === 1 ? "" : "s"}?`)) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: activeIds }),
      });
      const result = await response.json() as { error?: unknown; deactivatedCount?: unknown };
      if (response.status === 404) {
        setSelectedIds([]);
        await loadContacts(search);
        setNotice("Selection cleared because one or more contacts no longer exist. The contact list was refreshed.");
        return;
      }
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Unable to deactivate selected contacts.");
      }
      if (typeof result.deactivatedCount !== "number" || !Number.isSafeInteger(result.deactivatedCount) || result.deactivatedCount < 0) {
        throw new Error("The contact deactivation response was invalid.");
      }
      setSelectedIds([]);
      setNotice(`${result.deactivatedCount} contact${result.deactivatedCount === 1 ? "" : "s"} deactivated. Existing documents are unchanged.`);
      await loadContacts(search);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : "Unable to deactivate selected contacts.");
    }
  };

  const deleteUnusedSelectedContacts = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(
      `Permanently delete selected contacts that are not used? Contacts referenced by orders or other records will be retained.`,
    )) return;
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: selectedIds, operation: "delete-unused" }),
      });
      const result = await response.json() as {
        error?: unknown;
        deletedCount?: unknown;
        retainedContactCodes?: unknown;
      };
      if (response.status === 404) {
        setSelectedIds([]);
        await loadContacts(search);
        setNotice("Selection cleared because one or more contacts no longer exist. The contact list was refreshed.");
        return;
      }
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Unable to delete selected contacts.");
      }
      if (
        typeof result.deletedCount !== "number"
        || !Number.isSafeInteger(result.deletedCount)
        || result.deletedCount < 0
        || !Array.isArray(result.retainedContactCodes)
        || result.retainedContactCodes.some((code) => typeof code !== "string")
      ) {
        throw new Error("The contact deletion response was invalid.");
      }
      setSelectedIds([]);
      const retainedCount = result.retainedContactCodes.length;
      setNotice(
        `${result.deletedCount} unused contact${result.deletedCount === 1 ? "" : "s"} deleted.`
        + (retainedCount ? ` ${retainedCount} used contact${retainedCount === 1 ? " was" : "s were"} retained: ${result.retainedContactCodes.join(", ")}.` : ""),
      );
      await loadContacts(search);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete selected contacts.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/VENDORS`} className="text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline">
            Back to Vendors and Contacts
          </Link>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--erp-brand)]">Master data</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--erp-text)]">Unified Contact Master</h1>
          <p className="mt-2 text-sm text-slate-600">Each contact has one GSTIN and can hold multiple business roles, addresses, and bank accounts.</p>
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
        selectedIds={selectedIds}
        onToggleSelectAll={(checked, recordIds) => {
          setSelectedIds((current) => checked
            ? [...new Set([...current, ...recordIds])]
            : current.filter((id) => !recordIds.includes(id)));
        }}
        onToggleRowSelection={(contactId, checked) => {
          setSelectedIds((current) => checked
            ? [...new Set([...current, contactId])]
            : current.filter((id) => id !== contactId));
        }}
        onRowClick={(contactId) => router.push(`${basePath}/${encodeURIComponent(contactId)}`)}
        onDeleteSelected={() => void deactivateSelectedContacts()}
        deleteSelectedLabel="Deactivate selected"
        onBulkDeleteSelected={() => void deleteUnusedSelectedContacts()}
        bulkDeleteSelectedLabel="Delete unused"
        onSearchQueryChange={(query) => {
          setSelectedIds([]);
          setSearch(query);
        }}
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
      {hasMoreContacts ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void loadContacts(search, undefined, true)}
          >
            {loading ? "Loading contacts..." : "Load more contacts"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
