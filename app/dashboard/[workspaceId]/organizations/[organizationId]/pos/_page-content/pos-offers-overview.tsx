"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import {
  POS_OFFER_STATUS_OPTIONS,
  POS_OFFER_TYPE_OPTIONS,
  type PosOfferTypeCode,
} from "@/lib/services/pos/pos-offer-contract";

type PosOfferRow = {
  id: string;
  offerCode: string;
  name: string;
  description: string | null;
  offerType: string;
  scope: string;
  status: string;
  discountAmount: string | null;
  discountPercentage: string | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  getDiscountPercentage: string | null;
  comboPrice: string | null;
  startsAt: string;
  endsAt: string | null;
  targetLabels: string[];
  createdAt: string;
};

const PAGE_SIZE = 50;
const FIELDS: Array<{ key: keyof PosOfferRow; label: string }> = [
  { key: "offerCode", label: "Offer Code" },
  { key: "name", label: "Offer Name" },
  { key: "offerType", label: "Offer Type" },
  { key: "scope", label: "Scope" },
  { key: "targetLabels", label: "Targets" },
  { key: "discountAmount", label: "Offer Value" },
  { key: "startsAt", label: "Starts" },
  { key: "endsAt", label: "Ends" },
  { key: "status", label: "Status" },
];

function formatOfferDate(value: string | null) {
  if (!value) return "No end date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function getOfferValue(record: PosOfferRow) {
  if (record.discountAmount !== null) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" })
      .format(Number(record.discountAmount));
  }
  if (record.discountPercentage !== null) return `${record.discountPercentage}%`;
  if (record.buyQuantity !== null && record.getQuantity !== null) {
    return `Buy ${record.buyQuantity}, get ${record.getQuantity} at ${record.getDiscountPercentage}% off`;
  }
  if (record.comboPrice !== null) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" })
      .format(Number(record.comboPrice));
  }
  return "-";
}

function getTypeLabel(value: string) {
  return POS_OFFER_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function getScopeLabel(value: string) {
  return {
    CATEGORY: "Category",
    COLOUR: "Colour",
    SIZE: "Size",
    ALL: "For All",
  }[value] ?? value;
}

function getStatusLabel(value: string) {
  return POS_OFFER_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export default function PosOffersOverview({
  organizationId,
  offersPath,
  createdOfferCode,
}: {
  organizationId: string;
  offersPath: string;
  createdOfferCode?: string;
}) {
  const router = useRouter();
  const [records, setRecords] = useState<PosOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<PosOfferTypeCode | "ALL">("ALL");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [visibleFields, setVisibleFields] = useState<Array<string | keyof PosOfferRow>>(
    FIELDS.map(({ key }) => key),
  );
  const requestController = useRef<AbortController | null>(null);

  const loadOffers = useCallback(async (cursor?: string | null, append = false) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setLoadError("");
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (typeFilter !== "ALL") {
        const selectedType = POS_OFFER_TYPE_OPTIONS.find(({ value }) => value === typeFilter);
        if (selectedType) query.set("offerType", selectedType.slug);
      }
      if (search.trim()) query.set("search", search.trim());
      if (statusFilter !== "ALL") query.set("status", statusFilter);
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/offers?${query}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json() as {
        offers?: PosOfferRow[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load POS offers.");
      const offers = data.offers;
      if (!Array.isArray(offers)) throw new Error("The POS offer report response was invalid.");
      setRecords((current) => append ? [...current, ...offers] : offers);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : "Unable to load POS offers.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [organizationId, search, statusFilter, typeFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOffers();
    }, search.trim() ? 200 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      requestController.current?.abort();
    };
  }, [loadOffers, retryVersion, search]);

  useEffect(() => () => requestController.current?.abort(), []);

  const renderCell = (fieldKey: string, record: PosOfferRow) => {
    if (fieldKey === "offerCode") return <span className="font-semibold">{record.offerCode}</span>;
    if (fieldKey === "offerType") return getTypeLabel(record.offerType);
    if (fieldKey === "scope") return getScopeLabel(record.scope);
    if (fieldKey === "targetLabels") return record.targetLabels.join(", ") || "All eligible items";
    if (fieldKey === "discountAmount") return getOfferValue(record);
    if (fieldKey === "startsAt") return formatOfferDate(record.startsAt);
    if (fieldKey === "endsAt") return formatOfferDate(record.endsAt);
    if (fieldKey === "status") return <Badge>{getStatusLabel(record.status)}</Badge>;
    return String(record[fieldKey as keyof PosOfferRow] ?? "");
  };

  return (
    <section className="space-y-4">
      {createdOfferCode ? (
        <p role="status" className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-text)]">
          Offer {createdOfferCode} was created successfully.
        </p>
      ) : null}
      <Tabs
        ariaLabel="Offer type"
        scrollable
        value={typeFilter}
        onChange={(value) => {
          setRecords([]);
          setNextCursor(null);
          setLoading(true);
          setTypeFilter(value);
        }}
        tabs={[
          { value: "ALL", label: "All Types" },
          ...POS_OFFER_TYPE_OPTIONS.map(({ value, label }) => ({ value, label })),
        ]}
      />
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--erp-danger)]">{loadError}</p>
          <Button type="button" variant="secondary" onClick={() => setRetryVersion((current) => current + 1)}>
            Retry
          </Button>
        </div>
      ) : null}
      <ReportGrid
        title={`${typeFilter === "ALL" ? "All" : getTypeLabel(typeFilter)} POS Offers`}
        records={records}
        fields={FIELDS}
        visibleFields={visibleFields}
        onVisibleFieldsChange={setVisibleFields}
        storageKey={`report-grid:pos-offers:all:${organizationId}`}
        rowIdSelector={(record) => record.id}
        selectedIds={[]}
        selectable={false}
        onRowClick={(recordId) => router.push(`${offersPath}/record/${encodeURIComponent(recordId)}`)}
        statusOptions={["ALL", ...POS_OFFER_STATUS_OPTIONS.map(({ value }) => value)]}
        selectedStatus={statusFilter}
        onStatusChange={(status) => {
          setRecords([]);
          setNextCursor(null);
          setLoading(true);
          setStatusFilter(status);
        }}
        onSearchQueryChange={(query) => {
          setRecords([]);
          setNextCursor(null);
          setLoading(true);
          setSearch(query);
        }}
        serverSideSearch
        searchMinLength={2}
        isLoading={loading}
        renderCell={renderCell}
        emptyMessage="No offers have been created in any POS offer section."
      />
      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={loadingMore}
            onClick={() => void loadOffers(nextCursor, true)}
          >
            {loadingMore ? "Loading offers..." : "Load more offers"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
