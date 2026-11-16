"use client";

import { ArrowLeft, Clock3, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type CounterRecord = {
  id: string;
  counterName: string;
  createdAt: string;
  subSubLocationPath: string;
};

type ShiftRecord = {
  id: string;
  salespersonName: string;
  isMine: boolean;
  status: "OPEN" | "CLOSED";
  openingBalance: string;
  closingBalance: string | null;
  openedAt: string;
  closedAt: string | null;
  salesCount: number;
  grossSalesAmount: string;
  storeCreditAppliedAmount: string;
};

type ShiftReport = {
  shifts: ShiftRecord[];
  nextCursor: string | null;
};

const REPORT_FIELDS = [
  { key: "salespersonName", label: "Salesperson" },
  { key: "status", label: "Status" },
  { key: "openedAt", label: "Opened" },
  { key: "closedAt", label: "Closed" },
  { key: "openingBalance", label: "Opening balance" },
  { key: "salesCount", label: "Sales count" },
  { key: "grossSalesAmount", label: "Gross sales" },
  { key: "storeCreditAppliedAmount", label: "Store credit applied" },
  { key: "closingBalance", label: "Counted closing balance" },
];

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function PosDayBookCounterDetailPage({
  counter,
  dayBookHref,
  organizationId,
}: {
  counter: CounterRecord;
  dayBookHref: string;
  organizationId: string;
}) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [visibleFields, setVisibleFields] = useState<string[]>(REPORT_FIELDS.map(({ key }) => key));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const endpoint = `/api/organizations/${encodeURIComponent(organizationId)}/pos/counter-shifts`;

  const fetchShiftReport = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const query = new URLSearchParams({
      counterId: counter.id,
      limit: "50",
    });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`${endpoint}?${query}`, {
      cache: "no-store",
      signal,
    });
    const data = await response.json() as ShiftReport & { error?: string };
    if (!response.ok || !Array.isArray(data.shifts)) {
      throw new Error(data.error || "Unable to load counter shifts.");
    }
    return data;
  }, [counter.id, endpoint]);

  const loadShifts = useCallback(async (cursor?: string | null, append = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError("");
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await fetchShiftReport(cursor ?? null, controller.signal);
      setShifts((current) => append ? [...current, ...data.shifts] : data.shifts);
      setNextCursor(data.nextCursor);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load counter shifts.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [fetchShiftReport]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    fetchShiftReport(null, controller.signal)
      .then((data) => {
        setShifts(data.shifts);
        setNextCursor(data.nextCursor);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load counter shifts.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchShiftReport]);

  const displayedShifts = useMemo(
    () => selectedStatus === "ALL"
      ? shifts
      : shifts.filter((shift) => shift.status === selectedStatus),
    [selectedStatus, shifts],
  );
  const renderCell = (fieldKey: string, shift: ShiftRecord) => {
    switch (fieldKey) {
      case "status":
        return <Badge>{shift.status}</Badge>;
      case "openedAt":
        return formatDateTime(shift.openedAt);
      case "closedAt":
        return formatDateTime(shift.closedAt);
      case "openingBalance":
        return `Rs ${shift.openingBalance}`;
      case "closingBalance":
        return shift.closingBalance === null ? "-" : `Rs ${shift.closingBalance}`;
      case "salesCount":
        return shift.salesCount.toLocaleString();
      case "grossSalesAmount":
        return `Rs ${shift.grossSalesAmount}`;
      case "storeCreditAppliedAmount":
        return `Rs ${shift.storeCreditAppliedAmount}`;
      default:
        return String(shift[fieldKey as keyof ShiftRecord] ?? "");
    }
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Link
          href={dayBookHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to Day Book
        </Link>

        <header className="erp-page-header">
          <div>
            <p className="erp-eyebrow flex items-center gap-2">
              <Store aria-hidden="true" size={16} /> COUNTER DAY BOOK
            </p>
            <h1 className="erp-page-heading mt-1">{counter.counterName}</h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Counter shifts and salesperson-wise closing records.
            </p>
          </div>
          <Badge>POS COUNTER</Badge>
        </header>

        <Card className="space-y-5">
          <h2 className="erp-card-title">Counter details</h2>
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <dt className="erp-eyebrow">COUNTER NAME</dt>
              <dd className="break-words text-sm font-semibold text-[var(--erp-text)]">
                {counter.counterName}
              </dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className="erp-eyebrow">STOCK LOCATION</dt>
              <dd className="flex min-w-0 items-start gap-2 text-sm text-[var(--erp-text)]">
                <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--erp-muted)]" size={16} />
                <span className="break-words">{counter.subSubLocationPath}</span>
              </dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className="erp-eyebrow">CREATED</dt>
              <dd className="flex items-center gap-2 text-sm text-[var(--erp-text)]">
                <Clock3 aria-hidden="true" className="text-[var(--erp-muted)]" size={16} />
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(counter.createdAt))}
              </dd>
            </div>
          </dl>
        </Card>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
            <p className="text-sm text-[var(--erp-danger)]">{error}</p>
            <Button type="button" variant="secondary" onClick={() => void loadShifts()}>
              Retry
            </Button>
          </div>
        ) : null}

        {loading ? (
          <Card role="status" aria-busy="true">
            <p className="text-sm text-[var(--erp-muted)]">Loading counter closing report...</p>
          </Card>
        ) : (
          <>
            <ReportGrid
              title="Counter and salesperson closing report"
              records={displayedShifts}
              fields={REPORT_FIELDS}
              visibleFields={visibleFields}
              onVisibleFieldsChange={(fields) => setVisibleFields(fields.map(String))}
              storageKey={`pos-counter-shifts-columns:${organizationId}:${counter.id}`}
              rowIdSelector={(shift) => shift.id}
              selectedIds={[]}
              selectable={false}
              statusOptions={["ALL", "OPEN", "CLOSED"]}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              renderCell={renderCell}
              emptyMessage="No counter shifts match this report."
            />
            {nextCursor ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loadingMore}
                  onClick={() => void loadShifts(nextCursor, true)}
                >
                  {loadingMore ? "Loading..." : "Load more shifts"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Section>
    </Page>
  );
}
