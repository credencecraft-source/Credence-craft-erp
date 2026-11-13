"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import PosCounterCreateForm from "./pos-counter-create-form";

type CounterRecord = {
  id: string;
  counterName: string;
  subSubLocationId: string;
  subSubLocationPath: string;
  createdAt: string;
};

const PAGE_SIZE = 50;
const FIELDS: Array<{ key: keyof CounterRecord; label: string }> = [
  { key: "counterName", label: "Counter" },
  { key: "subSubLocationPath", label: "Sub-sub-location" },
  { key: "createdAt", label: "Created" },
];

export default function PosCounterPage({
  organizationId,
  canCreate,
  created,
}: {
  organizationId: string;
  canCreate: boolean;
  created: boolean;
}) {
  const [records, setRecords] = useState<CounterRecord[]>([]);
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdNotice, setCreatedNotice] = useState(false);
  const [reportGeneration, setReportGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [visibleFields, setVisibleFields] = useState<Array<string | keyof CounterRecord>>(
    FIELDS.map(({ key }) => key),
  );
  const controllerRef = useRef<AbortController | null>(null);

  const loadCounters = useCallback(async (
    cursor?: string | null,
    append = false,
    searchValue = search,
  ) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setLoadingMore(false);
      setRecords([]);
      setNextCursor(null);
    }
    setError("");

    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (searchValue.trim()) query.set("search", searchValue.trim());
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/counter?${query}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json() as {
        counters?: CounterRecord[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load POS counters.");
      if (!Array.isArray(data.counters)) {
        throw new Error("The POS counter report response was invalid.");
      }
      setRecords((current) => append ? [...current, ...data.counters!] : data.counters!);
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load POS counters.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [organizationId, search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadCounters(), search.trim() ? 200 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      controllerRef.current?.abort();
    };
  }, [loadCounters, search]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const renderCell = (key: string, record: CounterRecord) => {
    if (key === "counterName") return <span className="font-semibold">{record.counterName}</span>;
    if (key === "subSubLocationPath") return record.subSubLocationPath;
    if (key === "createdAt") {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(record.createdAt));
    }
    return String(record[key as keyof CounterRecord] ?? "");
  };

  function handleCreated() {
    setCreateModalOpen(false);
    setCreating(false);
    setCreatedNotice(true);
    setReportGeneration((generation) => generation + 1);
    if (search) {
      setSearch("");
    } else {
      void loadCounters(null, false, "");
    }
  }

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Point of Sale</p>
            <h1 className="erp-page-heading mt-1">Counter</h1>
            <p className="mt-2 text-sm text-[var(--erp-text-muted)]">
              Manage POS counters and their active Sub-sub-locations.
            </p>
          </div>
        </header>

        {created || createdNotice ? (
          <p role="status" className="rounded-xl border border-[var(--erp-success-border)] bg-[var(--erp-success-bg)] p-4 text-sm text-[var(--erp-success-text)]">
            Counter saved successfully.
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--erp-danger)]">{error}</p>
            <Button type="button" variant="secondary" onClick={() => void loadCounters()}>
              Retry
            </Button>
          </div>
        ) : null}

        <ReportGrid
          key={reportGeneration}
          title="POS Counters"
          records={records}
          fields={FIELDS}
          visibleFields={visibleFields}
          onVisibleFieldsChange={setVisibleFields}
          storageKey={`report-grid:pos-counters:${organizationId}`}
          rowIdSelector={(record) => record.id}
          selectedIds={[]}
          selectable={false}
          onSearchQueryChange={setSearch}
          serverSideSearch
          searchMinLength={2}
          onNewOrder={canCreate ? () => setCreateModalOpen(true) : undefined}
          newActionLabel="Add Record"
          toolbarActions={(
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => void loadCounters()}
            >
              Refresh
            </Button>
          )}
          renderCell={renderCell}
          isLoading={loading}
          emptyMessage="No POS counters have been created."
        />
        <Modal
          open={createModalOpen}
          onClose={() => {
            if (!creating) setCreateModalOpen(false);
          }}
          ariaLabelledBy="pos-counter-create-title"
          size="square"
          closeOnBackdrop={!creating}
        >
          <PosCounterCreateForm
            organizationId={organizationId}
            saving={creating}
            onSavingChange={setCreating}
            onCancel={() => {
              if (!creating) setCreateModalOpen(false);
            }}
            onCreated={handleCreated}
          />
        </Modal>
        {nextCursor ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="secondary"
              disabled={loadingMore}
              onClick={() => void loadCounters(nextCursor, true)}
            >
              {loadingMore ? "Loading..." : "Load more counters"}
            </Button>
          </div>
        ) : null}
      </Section>
    </Page>
  );
}
