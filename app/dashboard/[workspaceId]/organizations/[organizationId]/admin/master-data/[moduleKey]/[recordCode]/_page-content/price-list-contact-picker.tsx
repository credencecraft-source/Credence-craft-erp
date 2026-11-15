"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { ReportGrid } from "@/components/reports/report-grid-display";

type ContactOption = { id: string; code: string; name: string };

const PAGE_SIZE = 200;
const REPORT_FIELDS = [
  { key: "name", label: "Contact" },
  { key: "code", label: "Contact Code" },
];

export default function PriceListContactPicker({
  workspaceId,
  organizationId,
  priceListId,
}: {
  workspaceId: string;
  organizationId: string;
  priceListId: string;
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [visibleFields, setVisibleFields] = useState<string[]>(REPORT_FIELDS.map(({ key }) => key));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/price-list/${encodeURIComponent(priceListId)}`;
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/master-data/price-lists/${encodeURIComponent(priceListId)}/contacts`;
  const contactsCount = useRef(0);

  const loadContacts = useCallback(async (query: string, signal: AbortSignal, append = false) => {
    const offset = append ? contactsCount.current : 0;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        mode: "available",
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (query) params.set("search", query);
      const response = await fetch(`${endpoint}?${params.toString()}`, { signal, cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok || !Array.isArray(result)) {
        const message = typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "Unable to load Contacts.";
        throw new Error(message);
      }
      if (signal.aborted) return;
      const page = result as ContactOption[];
      setContacts((current) => {
        const next = append
          ? [...current, ...page.filter((contact) => !current.some((item) => item.id === contact.id))]
          : page;
        contactsCount.current = next.length;
        return next;
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch (loadError) {
      if (signal.aborted || (loadError instanceof Error && loadError.name === "AbortError")) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load Contacts.");
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSelectedIds([]);
      void loadContacts(search, controller.signal);
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadContacts, search]);

  const addContact = async () => {
    const contactId = selectedIds[0];
    if (!contactId || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "Unable to add this Contact.";
        throw new Error(message);
      }
      router.replace(reportPath);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add this Contact.");
    } finally {
      setSaving(false);
    }
  };

  const getSearchValue = useCallback((key: string, contact: ContactOption) =>
    key === "name" ? contact.name : key === "code" ? contact.code : "", []);
  const renderCell = useCallback((key: string, contact: ContactOption) =>
    key === "name" ? contact.name : key === "code" ? contact.code : "—", []);

  return (
    <Page>
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--erp-muted)]">Price List Type</p>
            <h1 className="text-2xl font-semibold text-[var(--erp-text)]">Add Contact</h1>
            <p className="text-sm text-[var(--erp-muted)]">Choose an existing active Contact from this organization.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>
            Cancel
          </Button>
        </div>

        {error ? (
          <Card className="flex flex-wrap items-center justify-between gap-3 border-[var(--erp-danger)]">
            <p className="text-sm text-[var(--erp-danger)]" role="alert">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const controller = new AbortController();
                void loadContacts(search, controller.signal);
              }}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        <ReportGrid
          title="Select from Contacts"
          records={contacts}
          fields={REPORT_FIELDS}
          visibleFields={visibleFields}
          onVisibleFieldsChange={setVisibleFields}
          storageKey={`price-list-contact-picker-${organizationId}`}
          rowIdSelector={(contact) => contact.id}
          selectedIds={selectedIds}
          selectable
          onToggleSelectAll={(_checked, contactIds) => setSelectedIds(contactIds.slice(0, 1))}
          onToggleRowSelection={(contactId, checked) => setSelectedIds(checked ? [contactId] : [])}
          toolbarActions={(
            <Button type="button" size="sm" disabled={selectedIds.length !== 1 || saving} onClick={() => void addContact()}>
              {saving ? "Adding..." : "Add selected Contact"}
            </Button>
          )}
          getSearchValue={getSearchValue}
          serverSideSearch
          onSearchQueryChange={(query) => {
            setSelectedIds([]);
            setSearch(query);
          }}
          renderCell={renderCell}
          isLoading={loading}
          emptyMessage={search ? "No matching active Contacts available." : "No active Contacts are available to add."}
        />
        {hasMore ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="secondary"
              disabled={loadingMore}
              onClick={() => {
                const controller = new AbortController();
                void loadContacts(search, controller.signal, true);
              }}
            >
              {loadingMore ? "Loading contacts..." : "Load more Contacts"}
            </Button>
          </div>
        ) : null}
      </Section>
    </Page>
  );
}
