"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { filterContactRecordsByRole } from "@/lib/master-data/contact-master-report";

type ContactRecord = {
  id: string;
  code: string;
  legal_name: string;
  display_name: string | null;
  is_active: boolean;
  roles: Array<{ role_code: string }>;
  distributor_mappings: Array<{ dealer: { id: string } }>;
  dealer_mappings: Array<{ distributor: { id: string } }>;
  role_parent_mappings: Array<{ parent_role_code: string; mapped_contact: { id: string } }>;
  role_mapped_contacts: Array<{ parent_contact: { id: string } }>;
  tax_registrations: Array<{ gstin: string }>;
  addresses: Array<{ id: string }>;
  bank_accounts: Array<{ id: string }>;
};

const CONTACT_REPORT_FIELDS = [
  { key: "contact", label: "Contact" },
  { key: "roles", label: "Roles" },
  { key: "related_count", label: "Related records" },
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
  const recordIds = new Set<string>();
  const add = (related: { id: string }) => recordIds.add(related.id);
  if (roleCode === "DISTRIBUTOR") {
    for (const mapping of contact.distributor_mappings ?? []) add(mapping.dealer);
    return recordIds.size;
  }
  if (roleCode === "AGENT") {
    for (const mapping of contact.role_parent_mappings ?? []) {
      if (mapping.parent_role_code === roleCode) add(mapping.mapped_contact);
    }
    return recordIds.size;
  }
  if (roleCode === "DEALER") {
    for (const mapping of contact.dealer_mappings ?? []) add(mapping.distributor);
    for (const mapping of contact.role_parent_mappings ?? []) {
      if (mapping.parent_role_code === roleCode) add(mapping.mapped_contact);
    }
    return recordIds.size;
  }
  if (roleCode === "CUSTOMER" || roleCode === "VENDOR") {
    for (const mapping of contact.role_mapped_contacts ?? []) add(mapping.parent_contact);
    return recordIds.size;
  }
  for (const mapping of contact.distributor_mappings ?? []) add(mapping.dealer);
  for (const mapping of contact.dealer_mappings ?? []) add(mapping.distributor);
  for (const mapping of contact.role_parent_mappings ?? []) {
    add(mapping.mapped_contact);
  }
  for (const mapping of contact.role_mapped_contacts ?? []) {
    add(mapping.parent_contact);
  }
  return recordIds.size;
}

const CONTACT_PAGE_SIZE = 100;
const CONTACT_SEARCH_MIN_LENGTH = 3;

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
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [roleCounts, setRoleCounts] = useState<Record<string, number> | null>(null);
  const [roleCountError, setRoleCountError] = useState("");
  const roleFilteredContacts = filterContactRecordsByRole(contacts, roleFilter);
  const effectiveSearch = search.trim().length >= CONTACT_SEARCH_MIN_LENGTH ? search.trim() : "";

  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/contacts`;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts`;

  const loadRoleCounts = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${endpoint}?summary=true`, { signal });
      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load contact role counts.");
      if (Object.values(data).some((value) =>
        typeof value !== "number" || !Number.isSafeInteger(value) || value < 0,
      )) {
        throw new Error("The contact role count response was invalid.");
      }
      if (signal?.aborted) return;
      setRoleCounts(data as Record<string, number>);
      setRoleCountError("");
    } catch (summaryError) {
      if (signal?.aborted || (summaryError instanceof Error && summaryError.name === "AbortError")) return;
      setRoleCountError(summaryError instanceof Error ? summaryError.message : "Unable to load contact role counts.");
    }
  }, [endpoint]);

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
      if (roleFilter) queryParams.set("roleCode", roleFilter);
      const response = await fetch(
        `${endpoint}?${queryParams.toString()}`,
        { signal },
      );
      const data = await response.json() as {
        records?: ContactRecord[];
        hasMore?: boolean;
        error?: string;
      };
      if (
        !response.ok
        || !Array.isArray(data.records)
        || typeof data.hasMore !== "boolean"
      ) {
        throw new Error(data.error ?? "Unable to load contacts.");
      }
      if (signal?.aborted || requestSequence !== contactRequestSequence.current) return;
      const loadedContacts = data.records;
      setContacts((current) => {
        if (!append) return loadedContacts;
        const existingIds = new Set(current.map(({ id }) => id));
        return [...current, ...loadedContacts.filter(({ id }) => !existingIds.has(id))];
      });
      contactOffset.current = offset + loadedContacts.length;
      setHasMoreContacts(data.hasMore);
    } catch (loadError) {
      if (signal?.aborted || requestSequence !== contactRequestSequence.current) return;
      if (loadError instanceof Error && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load contacts.");
    } finally {
      if (!signal?.aborted && requestSequence === contactRequestSequence.current) setLoading(false);
    }
  }, [endpoint, roleFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${endpoint}?summary=true`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as Record<string, unknown> & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load contact role counts.");
        if (Object.values(data).some((value) =>
          typeof value !== "number" || !Number.isSafeInteger(value) || value < 0,
        )) {
          throw new Error("The contact role count response was invalid.");
        }
        setRoleCounts(data as Record<string, number>);
        setRoleCountError("");
      })
      .catch((summaryError) => {
        if (controller.signal.aborted || (summaryError instanceof Error && summaryError.name === "AbortError")) return;
        setRoleCountError(summaryError instanceof Error ? summaryError.message : "Unable to load contact role counts.");
      });
    return () => controller.abort();
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadContacts(effectiveSearch, controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [effectiveSearch, loadContacts, roleFilter]);

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
      const deactivatedIds = new Set(activeIds);
      setContacts((current) => current.map((contact) => deactivatedIds.has(contact.id)
        ? { ...contact, is_active: false }
        : contact));
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
      const deletedCount = result.deletedCount;
      const retainedCodes = new Set(
        result.retainedContactCodes.filter((code): code is string => typeof code === "string"),
      );
      const removedContacts = contacts.filter((contact) =>
        selectedIds.includes(contact.id) && !retainedCodes.has(contact.code),
      );
      const removedIds = new Set(removedContacts.map((contact) => contact.id));
      contactOffset.current = Math.max(0, contactOffset.current - removedIds.size);
      setContacts((current) => current.filter((contact) => !removedIds.has(contact.id)));
      if (removedContacts.length === deletedCount) {
        setRoleCounts((current) => {
          if (!current) return current;
          const roleDeltas: Record<string, number> = {};
          let uncategorizedDelta = 0;
          for (const contact of removedContacts) {
            const roles = new Set(contact.roles.map(({ role_code }) => role_code));
            if (roles.size === 0) uncategorizedDelta += 1;
            for (const roleCode of roles) roleDeltas[roleCode] = (roleDeltas[roleCode] ?? 0) + 1;
          }
          return {
            ...current,
            total: Math.max(0, current.total - deletedCount),
            __UNCATEGORIZED__: Math.max(0, current.__UNCATEGORIZED__ - uncategorizedDelta),
            ...Object.fromEntries(Object.entries(roleDeltas).map(([roleCode, count]) => [
              roleCode,
              Math.max(0, (current[roleCode] ?? 0) - count),
            ])),
          };
        });
      } else {
        await loadRoleCounts();
      }
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
      {roleCountError ? <p className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-danger)]" role="alert">{roleCountError}</p> : null}
      {notice ? <p className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-surface)] px-4 py-3 text-sm text-[var(--erp-success)]" role="status">{notice}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Button
            variant="card"
            aria-pressed={roleFilter === ""}
            onClick={() => {
              setSelectedIds([]);
              setRoleFilter("");
            }}
            className={`w-full p-4 ${roleFilter === "" ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)]" : ""}`}
          >
            <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted)]">All Contacts</span>
            <span className="mt-1 block text-2xl font-bold text-[var(--erp-text)]">{roleCounts?.total ?? "—"}</span>
            <span className="mt-1 block text-xs text-[var(--erp-muted)]">Contacts</span>
        </Button>
        {Object.entries(ROLE_LABELS).map(([roleCode, roleLabel]) => {
          const count = roleCounts?.[roleCode];
          const selected = roleFilter === roleCode;
          return (
            <Button
              key={roleCode}
              variant="card"
              aria-pressed={selected}
              onClick={() => {
                setSelectedIds([]);
                setRoleFilter((current) => current === roleCode ? "" : roleCode);
              }}
              className={`w-full p-4 ${selected ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)]" : ""}`}
            >
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted)]">{roleLabel}</span>
                <span className="mt-1 block text-2xl font-bold text-[var(--erp-text)]">{count ?? "—"}</span>
                <span className="mt-1 block text-xs text-[var(--erp-muted)]">Contacts</span>
            </Button>
          );
        })}
        {(() => {
          const count = roleCounts?.__UNCATEGORIZED__;
          const selected = roleFilter === "__UNCATEGORIZED__";
          return (
            <Button
              variant="card"
              aria-pressed={selected}
              onClick={() => {
                setSelectedIds([]);
                setRoleFilter((current) => current === "__UNCATEGORIZED__" ? "" : "__UNCATEGORIZED__");
              }}
              className={`w-full p-4 ${selected ? "border-[var(--erp-brand)] bg-[var(--erp-brand-soft)]" : ""}`}
            >
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted)]">Uncategorized</span>
                <span className="mt-1 block text-2xl font-bold text-[var(--erp-text)]">{count ?? "—"}</span>
                <span className="mt-1 block text-xs text-[var(--erp-muted)]">Contacts</span>
            </Button>
          );
        })()}
      </div>

      <ReportGrid
        title={roleFilter === ""
          ? "All Contact records"
          : roleFilter === "__UNCATEGORIZED__"
            ? "Uncategorized Contact records"
            : `${ROLE_LABELS[roleFilter] ?? roleFilter} Contact records`}
        records={roleFilteredContacts}
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
        serverSideSearch
        searchMinLength={CONTACT_SEARCH_MIN_LENGTH}
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
        emptyMessage={effectiveSearch ? "No matching contacts." : "No contacts yet. Create a contact to start assigning business roles and tax registrations."}
      />
      {hasMoreContacts ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void loadContacts(search, undefined, true)}
          >
            {loading ? "Loading contacts..." : `Load ${CONTACT_PAGE_SIZE} more contacts`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
