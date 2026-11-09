"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type PurchaseBillRecord = {
  id: string;
  documentType: string;
  documentNumber: string;
  sourceModule: string;
  date: string;
  party: string;
  entity: string;
  amount: number;
  tax: number;
  net: number;
  status: string;
  paymentStatus: string;
};

const PURCHASE_BILL_PAGE_SIZE = 50;

const reportFields: Array<{ key: keyof PurchaseBillRecord; label: string }> = [
  { key: "documentNumber", label: "Bill No." },
  { key: "date", label: "Date" },
  { key: "party", label: "Vendor" },
  { key: "entity", label: "Entity" },
  { key: "amount", label: "Taxable Amount" },
  { key: "tax", label: "GST" },
  { key: "net", label: "Total Amount" },
  { key: "status", label: "Status" },
];

export default function PurchaseBillReportPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<PurchaseBillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const [visibleReportFields, setVisibleReportFields] = useState<
    Array<string | keyof PurchaseBillRecord>
  >(reportFields.map((field) => field.key));
  const [successMessage, setSuccessMessage] = useState(
    () => searchParams.get("success") ?? "",
  );
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos`;
  const createPath = `${base}/purchase-bill/new`;

  useEffect(() => {
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      setRecords([]);
      setNextCursor(null);
      try {
        const query = new URLSearchParams({ limit: String(PURCHASE_BILL_PAGE_SIZE) });
        if (search) query.set("search", search);
        const response = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill?${query}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json() as {
          bills?: PurchaseBillRecord[];
          nextCursor?: string | null;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Unable to load purchase bills.");
        if (!Array.isArray(data.bills)) throw new Error("The purchase bill response was invalid.");
        setRecords(data.bills);
        setNextCursor(data.nextCursor ?? null);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load purchase bills.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, search ? 200 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      if (requestController.current === controller) requestController.current = null;
    };
  }, [organizationId, search]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    setLoadingMore(true);
    setLoadError("");
    try {
      const query = new URLSearchParams({
        cursor: nextCursor,
        limit: String(PURCHASE_BILL_PAGE_SIZE),
      });
      if (search) query.set("search", search);
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill?${query}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json() as {
        bills?: PurchaseBillRecord[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load more purchase bills.");
      if (!Array.isArray(data.bills)) throw new Error("The purchase bill response was invalid.");
      const pageBills = data.bills;
      setRecords((current) => [...current, ...pageBills]);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : "Unable to load more purchase bills.");
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  const handleSearchQueryChange = (query: string) => {
    if (query === search) return;
    requestController.current?.abort();
    setRecords([]);
    setNextCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setLoadError("");
    setSearch(query);
  };

  const renderCell = (fieldKey: string, record: PurchaseBillRecord) => {
    if (["amount", "tax", "net"].includes(fieldKey)) {
      const value = Number(record[fieldKey as "amount" | "tax" | "net"] ?? 0);
      return (
        <span
          className={
            fieldKey === "net" ? "font-bold text-slate-900" : "text-slate-700"
          }
        >
          Rs {value.toFixed(2)}
        </span>
      );
    }
    return String(record[fieldKey as keyof PurchaseBillRecord] ?? "");
  };

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="erp-page-header">
          <div>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              Purchase Bills
            </h1>
          </div>
          <Link
            href={createPath}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + New Purchase Bill
          </Link>
        </div>
        {loadError ? <p role="alert">{loadError}</p> : null}
        <ReportGrid
          title="Purchase Bill Report"
          records={records}
          fields={reportFields}
          visibleFields={visibleReportFields}
          onVisibleFieldsChange={setVisibleReportFields}
          rowIdSelector={(record) => record.id}
          selectedIds={[]}
          onRowClick={(recordId) => router.push(`${base}/purchase-bill/${encodeURIComponent(recordId)}`)}
          onRowAction={(recordId) => router.push(`${base}/purchase-bill/${encodeURIComponent(recordId)}`)}
          rowActionLabel="Approve & Create Stock"
          onSearchQueryChange={handleSearchQueryChange}
          serverSideSearch
          searchMinLength={2}
          isLoading={loading}
          renderCell={renderCell}
          emptyMessage="No purchase bill records found."
        />
        {nextCursor ? (
          <div className="flex justify-center">
            <Button type="button" variant="secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading bills..." : "Load more purchase bills"}
            </Button>
          </div>
        ) : null}
      </Section>
      <Modal
        open={Boolean(successMessage)}
        onClose={() => {
          setSuccessMessage("");
          router.replace(`${base}/purchase-bill`);
        }}
        ariaLabel="Purchase bill posted successfully"
        variant="success"
        size="sm"
      >
        <div className="space-y-4 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Posted successfully
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Purchase bill saved
            </h2>
            <p className="mt-2 text-sm text-slate-600">{successMessage}</p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSuccessMessage("");
                router.replace(`${base}/purchase-bill`);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
