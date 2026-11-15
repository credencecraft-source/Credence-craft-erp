"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";

type CouponRow = {
  id: string;
  couponCode: string;
  name: string;
  couponType: "GENERAL" | "PURCHASE_REWARD";
  status: "ACTIVE" | "INACTIVE";
  discountType: "FLAT_AMOUNT" | "PERCENTAGE";
  discountValue: string;
  minimumPurchase: string;
  startsAt: string;
  endsAt: string | null;
  maxRedemptions: number | null;
  validityDays: number | null;
  issuedCount: number;
  redemptionCount: number;
  createdAt: string;
};

type CouponIssueRow = {
  id: string;
  couponCode: string;
  name: string;
  discountType: "FLAT_AMOUNT" | "PERCENTAGE";
  discountValue: string;
  customerName: string;
  customerPhone: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  expiresAt: string | null;
  claimedInvoiceNumber: string | null;
  claimedAt: string | null;
  status: "ACTIVE" | "EXPIRED" | "CLAIMED";
  createdAt: string;
};

type CouponReportTab = "PLAN" | "EXPIRED" | "ACTIVE" | "CLAIMED";

const PAGE_SIZE = 50;
const FIELDS: Array<{ key: keyof CouponRow; label: string }> = [
  { key: "couponCode", label: "Coupon Code" },
  { key: "name", label: "Name / Campaign" },
  { key: "couponType", label: "Type" },
  { key: "discountValue", label: "Discount" },
  { key: "minimumPurchase", label: "Minimum Purchase" },
  { key: "status", label: "Status" },
  { key: "startsAt", label: "Starts" },
  { key: "endsAt", label: "Ends" },
  { key: "issuedCount", label: "Issued" },
  { key: "redemptionCount", label: "Redeemed" },
];
const ISSUE_FIELDS: Array<{ key: keyof CouponIssueRow; label: string }> = [
  { key: "couponCode", label: "Coupon Code" },
  { key: "name", label: "Reward" },
  { key: "discountValue", label: "Discount" },
  { key: "customerName", label: "Customer" },
  { key: "customerPhone", label: "Phone" },
  { key: "invoiceNumber", label: "Issued From Invoice" },
  { key: "invoiceDate", label: "Invoice Date" },
  { key: "expiresAt", label: "Expires" },
  { key: "claimedInvoiceNumber", label: "Claimed On Invoice" },
  { key: "claimedAt", label: "Claimed At" },
  { key: "status", label: "Status" },
];

function formatCurrency(value: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(Number(value));
}

export default function PosCouponReport({
  organizationId,
  created,
}: {
  organizationId: string;
  created: boolean;
}) {
  const [records, setRecords] = useState<CouponRow[]>([]);
  const [issueRecords, setIssueRecords] = useState<CouponIssueRow[]>([]);
  const [activeTab, setActiveTab] = useState<CouponReportTab>("PLAN");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [visibleFields, setVisibleFields] = useState<Array<string | keyof CouponRow>>(
    FIELDS.map(({ key }) => key),
  );
  const [visibleIssueFields, setVisibleIssueFields] = useState<Array<string | keyof CouponIssueRow>>(
    ISSUE_FIELDS.map(({ key }) => key),
  );
  const controllerRef = useRef<AbortController | null>(null);

  const loadCoupons = useCallback(async (cursor?: string | null, append = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (search.trim()) query.set("search", search.trim());
      if (cursor) query.set("cursor", cursor);
      if (activeTab !== "PLAN") query.set("status", activeTab);
      const endpoint = activeTab === "PLAN"
        ? `/api/organizations/${encodeURIComponent(organizationId)}/pos/coupons`
        : `/api/organizations/${encodeURIComponent(organizationId)}/pos/coupons/issues`;
      const response = await fetch(
        `${endpoint}?${query}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json() as {
        coupons?: CouponRow[];
        issues?: CouponIssueRow[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Unable to load POS coupons.");
      if (activeTab === "PLAN") {
        if (!Array.isArray(data.coupons)) throw new Error("The coupon plan response was invalid.");
        setRecords((current) => append ? [...current, ...data.coupons!] : data.coupons!);
      } else {
        if (!Array.isArray(data.issues)) throw new Error("The issued-coupon response was invalid.");
        setIssueRecords((current) => append ? [...current, ...data.issues!] : data.issues!);
      }
      setNextCursor(data.nextCursor ?? null);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load POS coupons.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [activeTab, organizationId, search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadCoupons(), search.trim() ? 200 : 0);
    return () => {
      window.clearTimeout(timeoutId);
      controllerRef.current?.abort();
    };
  }, [loadCoupons, search]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const renderCell = (key: string, record: CouponRow) => {
    if (key === "couponType") return record.couponType === "GENERAL" ? "General Coupon" : "Purchase Reward";
    if (key === "discountValue") {
      return record.discountType === "PERCENTAGE"
        ? `${record.discountValue}%`
        : formatCurrency(record.discountValue);
    }
    if (key === "minimumPurchase") return formatCurrency(record.minimumPurchase);
    if (key === "startsAt" || key === "endsAt") {
      const date = record[key];
      return date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" })
        .format(new Date(`${date}T00:00:00.000Z`)) : "No end date";
    }
    if (key === "status") return <Badge>{record.status}</Badge>;
    if (key === "couponCode") return <span className="font-semibold">{record.couponCode}</span>;
    return String(record[key as keyof CouponRow] ?? "");
  };

  const renderIssueCell = (key: string, record: CouponIssueRow) => {
    if (key === "discountValue") {
      return record.discountType === "PERCENTAGE"
        ? `${record.discountValue}%`
        : formatCurrency(record.discountValue);
    }
    if (key === "invoiceDate" || key === "expiresAt" || key === "claimedAt") {
      const date = record[key];
      return date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" })
        .format(new Date(key === "claimedAt" ? date : `${date}T00:00:00.000Z`))
        : key === "expiresAt" ? "No expiry" : "—";
    }
    if (key === "status") return <Badge>{record.status}</Badge>;
    if (key === "couponCode") return <span className="font-semibold">{record.couponCode}</span>;
    return String(record[key as keyof CouponIssueRow] ?? "");
  };

  return (
    <div className="space-y-4">
      {created ? (
        <p role="status" className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-text)]">
          Coupon saved successfully.
        </p>
      ) : null}
      <Tabs
        ariaLabel="POS coupon views"
        value={activeTab}
        onChange={(value) => {
          setRecords([]);
          setIssueRecords([]);
          setNextCursor(null);
          setLoading(true);
          setError("");
          setSearch("");
          setActiveTab(value);
        }}
        tabs={[
          { value: "PLAN", label: "Plan" },
          { value: "EXPIRED", label: "Expired" },
          { value: "ACTIVE", label: "Active" },
          { value: "CLAIMED", label: "Claimed" },
        ]}
      />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--erp-danger)]">{error}</p>
          <Button type="button" variant="secondary" onClick={() => void loadCoupons()}>Retry</Button>
        </div>
      ) : null}
      {loading ? <p role="status">Loading POS coupons...</p> : (
        <>
          {activeTab === "PLAN" ? (
            <ReportGrid
              title="Coupon Plans"
              records={records}
              fields={FIELDS}
              visibleFields={visibleFields}
              onVisibleFieldsChange={setVisibleFields}
              storageKey={`report-grid:pos-coupons:${organizationId}`}
              rowIdSelector={(record) => record.id}
              selectedIds={[]}
              onSearchQueryChange={setSearch}
              serverSideSearch
              searchMinLength={2}
              renderCell={renderCell}
              emptyMessage="No coupon plans found."
            />
          ) : (
            <ReportGrid
              title={activeTab === "CLAIMED"
                ? "Claimed Coupons"
                : activeTab === "ACTIVE" ? "Active Issued Coupons" : "Expired Issued Coupons"}
              records={issueRecords}
              fields={ISSUE_FIELDS}
              visibleFields={visibleIssueFields}
              onVisibleFieldsChange={setVisibleIssueFields}
              storageKey={`report-grid:pos-coupon-issues:${activeTab.toLowerCase()}:${organizationId}`}
              rowIdSelector={(record) => record.id}
              selectedIds={[]}
              onSearchQueryChange={setSearch}
              serverSideSearch
              searchMinLength={2}
              renderCell={renderIssueCell}
              emptyMessage={activeTab === "CLAIMED"
                ? "No claimed coupons found."
                : activeTab === "ACTIVE"
                  ? "No active issued coupons found."
                  : "No expired issued coupons found."}
            />
          )}
          {nextCursor ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                disabled={loadingMore}
                onClick={() => void loadCoupons(nextCursor, true)}
              >
                {loadingMore ? "Loading..." : "Load more coupons"}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={() => void loadCoupons()}>Refresh</Button>
      </div>
    </div>
  );
}
