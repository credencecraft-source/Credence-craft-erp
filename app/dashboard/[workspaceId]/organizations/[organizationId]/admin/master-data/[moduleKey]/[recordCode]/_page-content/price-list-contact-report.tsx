"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { ReportGrid } from "@/components/reports/report-grid-display";

type ContactAssignment = {
  id: string;
  contactId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

type ContactOption = { id: string; code: string; name: string };

const PAGE_SIZE = 200;
const LOOKUP_PAGE_SIZE = 50;
const REPORT_FIELDS = [
  { key: "name", label: "Contact" },
  { key: "code", label: "Contact Code" },
  { key: "status", label: "Status" },
];

export default function PriceListContactReport({
  workspaceId,
  organizationId,
  priceListId,
  groupName,
  priceListType,
}: {
  workspaceId: string;
  organizationId: string;
  priceListId: string;
  groupName?: string;
  priceListType?: string;
}) {
  const router = useRouter();
  const [records, setRecords] = useState<ContactAssignment[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>(REPORT_FIELDS.map(({ key }) => key));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [showContactLookup, setShowContactLookup] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupContacts, setLookupContacts] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const priceListPath = priceListType
    ? `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/price-list/type/${encodeURIComponent(priceListType)}`
    : `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/price-list`;
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/master-data/price-lists/${encodeURIComponent(priceListId)}/contacts`;
  const recordsCount = useRef(0);

  const loadRecords = useCallback(async (query: string, signal: AbortSignal, append = false) => {
    const offset = append ? recordsCount.current : 0;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (query) params.set("search", query);
      const response = await fetch(`${endpoint}?${params.toString()}`, { signal, cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok || !Array.isArray(result)) {
        const message = typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "Unable to load Price List Type contacts.";
        throw new Error(message);
      }
      if (signal.aborted) return;
      const page = result as ContactAssignment[];
      setRecords((current) => {
        const next = append
          ? [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))]
          : page;
        recordsCount.current = next.length;
        return next;
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch (loadError) {
      if (signal.aborted || (loadError instanceof Error && loadError.name === "AbortError")) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load Price List Type contacts.");
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadRecords(search, controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadRecords, search]);

  useEffect(() => {
    if (!showContactLookup) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookupLoading(true);
      setLookupError("");
      setLookupContacts([]);
      try {
        const params = new URLSearchParams({
          mode: "available",
          limit: String(LOOKUP_PAGE_SIZE),
          offset: "0",
        });
        if (lookupQuery.trim()) params.set("search", lookupQuery.trim());
        const response = await fetch(`${endpoint}?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok || !Array.isArray(result)) {
          const message = typeof result === "object" && result !== null && "error" in result
            ? String(result.error)
            : "Unable to search Contacts.";
          throw new Error(message);
        }
        if (!controller.signal.aborted) setLookupContacts(result as ContactOption[]);
      } catch (lookupLoadError) {
        if (controller.signal.aborted || (lookupLoadError instanceof Error && lookupLoadError.name === "AbortError")) return;
        setLookupError(lookupLoadError instanceof Error ? lookupLoadError.message : "Unable to search Contacts.");
      } finally {
        if (!controller.signal.aborted) setLookupLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, lookupQuery, showContactLookup]);

  const addContact = async () => {
    if (!selectedContact || saving) return;
    setSaving(true);
    setLookupError("");
    setSavedMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContact.id }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "Unable to add this Contact.";
        throw new Error(message);
      }
      setShowContactLookup(false);
      setLookupQuery("");
      setLookupContacts([]);
      setSelectedContact(null);
      setSavedMessage(`${selectedContact.name} was added to this Price List.`);
      const controller = new AbortController();
      await loadRecords(search, controller.signal);
    } catch (saveError) {
      setLookupError(saveError instanceof Error ? saveError.message : "Unable to add this Contact.");
    } finally {
      setSaving(false);
    }
  };

  const closeContactLookup = () => {
    setShowContactLookup(false);
    setLookupQuery("");
    setLookupContacts([]);
    setSelectedContact(null);
    setLookupError("");
  };

  const getSearchValue = useCallback((key: string, record: ContactAssignment) => {
    if (key === "name") return record.name;
    if (key === "code") return record.code;
    if (key === "status") return record.isActive ? "active" : "inactive";
    return "";
  }, []);
  const renderCell = useCallback((key: string, record: ContactAssignment) => {
    if (key === "name") return record.name;
    if (key === "code") return record.code;
    if (key === "status") {
      return (
        <Badge className={record.isActive
          ? "border-[var(--erp-success)] bg-[var(--erp-success-soft)] text-[var(--erp-success)]"
          : "border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-[var(--erp-muted)]"}>
          {record.isActive ? "Active" : "Inactive"}
        </Badge>
      );
    }
    return "—";
  }, []);

  return (
    <Page>
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--erp-muted)]">Master Data / Price List</p>
            <h1 className="text-2xl font-semibold text-[var(--erp-text)]">{groupName ?? "Price List Type"}</h1>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(priceListPath)}>
            Back to Price List
          </Button>
        </div>
        {savedMessage ? (
          <Card className="border-[var(--erp-success)] bg-[var(--erp-success-soft)]">
            <p className="text-sm text-[var(--erp-success)]" role="status">{savedMessage}</p>
          </Card>
        ) : null}
        {showContactLookup ? (
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--erp-text)]">Add Contact</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Search for and select an active Contact from this organization.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={closeContactLookup} disabled={saving}>
                Cancel
              </Button>
            </div>
            <Input
              label="Contact lookup"
              type="search"
              value={lookupQuery}
              onChange={(event) => {
                setLookupQuery(event.target.value);
                setSelectedContact(null);
              }}
              placeholder="Search by contact name or code"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="price-list-contact-options"
              aria-expanded="true"
            />
            {selectedContact ? (
              <p className="text-sm text-[var(--erp-text)]" role="status">
                Selected: <span className="font-semibold">{selectedContact.name}</span> ({selectedContact.code})
              </p>
            ) : null}
            {lookupError ? (
              <p className="text-sm text-[var(--erp-danger)]" role="alert">{lookupError}</p>
            ) : null}
            <div
              id="price-list-contact-options"
              role="listbox"
              aria-label="Available Contacts"
              className="max-h-60 overflow-y-auto rounded-xl border border-[var(--erp-border)]"
            >
              {lookupLoading ? (
                <p className="px-3 py-2 text-sm text-[var(--erp-muted)]" role="status">Searching Contacts...</p>
              ) : lookupContacts.length ? (
                lookupContacts.map((contact) => (
                  <Button
                    key={contact.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    role="option"
                    aria-selected={selectedContact?.id === contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className="flex min-h-0 w-full justify-between rounded-none border-b border-[var(--erp-border)] px-3 py-2 text-left text-sm last:border-b-0"
                  >
                    <span className="font-medium">{contact.name}</span>
                    <span className="text-[var(--erp-muted)]">{contact.code}</span>
                  </Button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-[var(--erp-muted)]">
                  {lookupQuery ? "No matching active Contacts found." : "No active unassigned Contacts are available."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!selectedContact || saving} onClick={() => void addContact()}>
                {saving ? "Submitting..." : "Submit"}
              </Button>
              <Button type="button" variant="secondary" onClick={closeContactLookup} disabled={saving}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : null}
        {error ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-[var(--erp-danger)]">
            <p className="text-sm text-[var(--erp-danger)]" role="alert">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const controller = new AbortController();
                void loadRecords(search, controller.signal);
              }}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        <ReportGrid
          title="Price List Type"
          records={records}
          fields={REPORT_FIELDS}
          visibleFields={visibleFields}
          onVisibleFieldsChange={setVisibleFields}
          storageKey={`price-list-contact-report-${organizationId}`}
          rowIdSelector={(record) => record.contactId}
          selectedIds={[]}
          selectable={false}
          onRowClick={(contactId) => router.push(
            `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts/${encodeURIComponent(contactId)}`,
          )}
          onNewOrder={() => {
            setSavedMessage("");
            setShowContactLookup(true);
          }}
          newActionLabel="+ Add Contact"
          getSearchValue={getSearchValue}
          serverSideSearch
          onSearchQueryChange={setSearch}
          renderCell={renderCell}
          isLoading={loading}
          emptyMessage="No Contacts have been added to this Price List Type."
        />
        {hasMore ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="secondary"
              disabled={loadingMore}
              onClick={() => {
                const controller = new AbortController();
                void loadRecords(search, controller.signal, true);
              }}
            >
              {loadingMore ? "Loading contacts..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </Section>
    </Page>
  );
}
