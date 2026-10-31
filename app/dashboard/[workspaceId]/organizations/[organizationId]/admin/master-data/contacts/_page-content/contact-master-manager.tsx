"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ReportGrid } from "@/components/reports/report-grid-display";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook-parser";

type ContactRecord = ContactWorkbookRecord;

const CONTACT_REPORT_FIELDS = [
  { key: "contact", label: "Contact" },
  { key: "roles", label: "Roles" },
  { key: "related_count", label: "Related count" },
  { key: "gstins", label: "GSTIN" },
  { key: "addresses_banks", label: "Addresses / banks" },
  { key: "status", label: "Status" },
];

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer",
  VENDOR: "Vendor",
  AGENT: "Agent",
  DISTRIBUTOR: "Distributor",
  DEALER: "Dealer",
};

function getRelatedCount(contact: ContactRecord, roleCode = "") {
  const counts = new Map<string, number>();
  const add = (key: string) => counts.set(key, 1);
  if (roleCode === "DISTRIBUTOR") {
    for (const mapping of contact.distributor_mappings ?? []) add(`dealer:${mapping.dealer.id}`);
    return counts.size;
  }
  if (roleCode === "AGENT") {
    for (const mapping of contact.role_parent_mappings ?? []) {
      if (mapping.parent_role_code === roleCode) add(`${roleCode}:${mapping.mapped_contact.id}`);
    }
    return counts.size;
  }
  if (roleCode === "DEALER") {
    for (const mapping of contact.dealer_mappings ?? []) add(`distributor:${mapping.distributor.id}`);
    for (const mapping of contact.role_parent_mappings ?? []) {
      if (mapping.parent_role_code === roleCode) add(`${roleCode}:${mapping.mapped_contact.id}`);
    }
    return counts.size;
  }
  if (roleCode === "CUSTOMER" || roleCode === "VENDOR") {
    for (const mapping of contact.role_mapped_contacts ?? []) add(`${mapping.parent_role_code}:${mapping.parent_contact.id}`);
    return counts.size;
  }
  for (const mapping of contact.distributor_mappings ?? []) add(`dealer:${mapping.dealer.id}`);
  for (const mapping of contact.dealer_mappings ?? []) add(`distributor:${mapping.distributor.id}`);
  for (const mapping of contact.role_parent_mappings ?? []) {
    add(`${mapping.parent_role_code}:${mapping.mapped_contact.id}`);
  }
  for (const mapping of contact.role_mapped_contacts ?? []) {
    add(`${mapping.parent_role_code}:${mapping.parent_contact.id}`);
  }
  return counts.size;
}

function getRelationshipTotal(records: ContactRecord[], roleCode = "") {
  return records.reduce((sum, contact) => sum + getRelatedCount(contact, roleCode), 0);
}

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
  const [roleSummaryContacts, setRoleSummaryContacts] = useState<ContactRecord[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>("");

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
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ContactRecord[] | { error?: string };
        if (!response.ok || !Array.isArray(data)) return;
        setRoleSummaryContacts(data);
      })
      .catch((summaryError) => {
        if (!(summaryError instanceof Error && summaryError.name === "AbortError")) return;
      });
    return () => controller.abort();
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadContacts(search, controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadContacts, search]);

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Card className={roleFilter === ""
          ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] p-0"
          : "p-0"}>
          <button
            type="button"
            aria-pressed={roleFilter === ""}
            onClick={() => setRoleFilter("")}
            className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
          >
            <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted)]">All Contacts</span>
            <span className="mt-1 block text-2xl font-bold text-[var(--erp-text)]">{roleSummaryContacts.length}</span>
            <span className="mt-1 block text-xs text-[var(--erp-muted)]">
              {getRelationshipTotal(roleSummaryContacts)} relationships
            </span>
          </button>
        </Card>
        {Object.entries(ROLE_LABELS).map(([roleCode, roleLabel]) => {
          const count = roleSummaryContacts.filter((contact) =>
            contact.roles.some((role) => role.role_code === roleCode),
          ).length;
          const relationshipCount = roleSummaryContacts
            .filter((contact) => contact.roles.some((role) => role.role_code === roleCode))
            .reduce((sum, contact) => sum + getRelatedCount(contact, roleCode), 0);
          const selected = roleFilter === roleCode;
          return (
            <Card
              key={roleCode}
              className={selected
                ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] p-0"
                : "p-0"}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setRoleFilter((current) => current === roleCode ? "" : roleCode)}
                className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
              >
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted)]">{roleLabel}</span>
                <span className="mt-1 block text-2xl font-bold text-[var(--erp-text)]">{count}</span>
                <span className="mt-1 block text-xs text-[var(--erp-muted)]">
                  {relationshipCount > 0
                    ? `${relationshipCount} relationship${relationshipCount === 1 ? "" : "s"}`
                    : "Contacts"}
                </span>
              </button>
            </Card>
          );
        })}
        {(() => {
          const uncategorizedContacts = roleSummaryContacts.filter((contact) => contact.roles.length === 0);
          const count = uncategorizedContacts.length;
          const selected = roleFilter === "__UNCATEGORIZED__";
          return (
            <Card className={selected
              ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] p-0"
              : "p-0"}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setRoleFilter((current) => current === "__UNCATEGORIZED__" ? "" : "__UNCATEGORIZED__")}
                className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)]"
              >
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted)]">Uncategorized</span>
                <span className="mt-1 block text-2xl font-bold text-[var(--erp-text)]">{count}</span>
                <span className="mt-1 block text-xs text-[var(--erp-muted)]">
                  {getRelationshipTotal(uncategorizedContacts)} relationships
                </span>
              </button>
            </Card>
          );
        })()}
      </div>

      <ReportGrid
        title={roleFilter === ""
          ? "All Contact records"
          : roleFilter === "__UNCATEGORIZED__"
            ? "Uncategorized Contact records"
            : `${ROLE_LABELS[roleFilter] ?? roleFilter} Contact records`}
        records={roleFilter
          ? contacts.filter((contact) => roleFilter === "__UNCATEGORIZED__"
            ? contact.roles.length === 0
            : contact.roles.some((role) => role.role_code === roleFilter))
          : contacts}
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
            case "related_count":
              return String(getRelatedCount(contact, roleFilter));
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
            case "related_count":
              return getRelatedCount(contact, roleFilter);
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
