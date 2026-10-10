"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type ReceiptLine = {
  id: string;
  rmGrnVerification: { id: string } | null;
  raw_material: string | null;
  ordered_quantity: number | string;
  received_quantity: number | string;
  accepted_quantity: number | string;
  rejected_quantity: number | string;
  purchaseOrderLine: {
    masterPurchaseOrder: { id: string } | null;
    category: string | null;
    sub_category: string | null;
    source_order_no: string | null;
    style_name: string | null;
    price: number | string | null;
    gst: number | string | null;
    tax_type: string | null;
    cgst_rate: number | string | null;
    sgst_rate: number | string | null;
    igst_rate: number | string | null;
    cgst_amount: number | string | null;
    sgst_amount: number | string | null;
    igst_amount: number | string | null;
    hsn_code: string | null;
    total: number | string | null;
  } | null;
};

type Receipt = {
  id: string;
  receipt_no: string;
  status: string;
  received_date: string;
  received_by: string | null;
  notes: string | null;
  entity: { entity_name: string } | null;
  location: { location_name: string } | null;
  purchaseOrder: { purchase_order_no: string; display_no: number | null };
  lines: ReceiptLine[];
};

type StockVerificationTask = {
  sourceGroupedPurchaseOrderId: string;
  masterPurchaseOrderId: string;
  masterGroupingNumber: string;
  groupingNumber: string;
  stockReference: string;
  rawMaterialName: string;
  category: string | null;
  subCategory: string | null;
  entityName: string;
  expectedQuantity: string;
  createdAt: string;
};

type VerificationRow = {
  id: string;
  receiptId: string;
  receiptLineId: string | null;
  sourceGroupedPurchaseOrderId: string | null;
  isStockIssue: boolean;
  masterPurchaseOrderId: string | null;
  receipt_no: string;
  status: string;
  verification_status: "Pending" | "Verified";
  received_date: string;
  purchase_order_no: string;
  entity_name: string;
  location_name: string;
  received_by: string;
  notes: string;
  raw_material: string;
  category: string;
  sub_category: string;
  source_order_no: string;
  style_name: string;
  hsn_code: string;
  ordered_quantity: number | string | null;
  received_quantity: number | string | null;
  accepted_quantity: number | string | null;
  rejected_quantity: number | string | null;
  price: number | string | null;
  tax_type: string;
  gst: number | string | null;
  cgst_rate: number | string | null;
  cgst_amount: number | string | null;
  sgst_rate: number | string | null;
  sgst_amount: number | string | null;
  igst_rate: number | string | null;
  igst_amount: number | string | null;
  total: number | string | null;
  isVerified: boolean;
};

type VerificationAllocation = {
  groupedPurchaseOrderId: string;
  groupingNumber: string;
  totalGroupedQty: string;
  verificationAllocated: string;
  balanceToAllocate: string;
};

type VerificationDetails = {
  receiptLineId: string | null;
  sourceGroupedPurchaseOrderId?: string | null;
  isStockIssue?: boolean;
  masterPurchaseOrderId: string | null;
  grnNumber: string;
  rawMaterialName: string;
  grnQuantity: string;
  purchaseOrderNumber: string;
  masterGroupingNumber: string;
  poQuantity: string;
  groupedQtyGrn: string;
  verifiedQuantity: string;
  approvedQuantity: string;
  rejectedQuantity: string;
  freshExcess: string;
  totalExcess: string;
  availableToAllocate: string;
  groupedAllocated: string;
  groupedBalanceToAllocate: string;
  allocations: VerificationAllocation[];
};

const reportFields: Array<{ key: Exclude<keyof VerificationRow, "isVerified" | "isStockIssue" | "sourceGroupedPurchaseOrderId" | "receiptLineId">; label: string }> = [
  { key: "receipt_no", label: "GRN No" },
  { key: "verification_status", label: "Verification Status" },
  { key: "status", label: "Status" },
  { key: "received_date", label: "Received Date" },
  { key: "purchase_order_no", label: "PO No" },
  { key: "entity_name", label: "Entity" },
  { key: "location_name", label: "Location" },
  { key: "received_by", label: "Received By" },
  { key: "raw_material", label: "Raw Material" },
  { key: "category", label: "Category" },
  { key: "sub_category", label: "Sub-category" },
  { key: "source_order_no", label: "Source Order" },
  { key: "style_name", label: "Style" },
  { key: "hsn_code", label: "HSN" },
  { key: "ordered_quantity", label: "PO Qty" },
  { key: "received_quantity", label: "GRN Qty" },
  { key: "accepted_quantity", label: "Accepted Qty" },
  { key: "rejected_quantity", label: "Rejected Qty" },
  { key: "price", label: "PO Unit Price" },
  { key: "tax_type", label: "Tax Type" },
  { key: "gst", label: "GST %" },
  { key: "cgst_rate", label: "CGST %" },
  { key: "cgst_amount", label: "CGST Amount" },
  { key: "sgst_rate", label: "SGST %" },
  { key: "sgst_amount", label: "SGST Amount" },
  { key: "igst_rate", label: "IGST %" },
  { key: "igst_amount", label: "IGST Amount" },
  { key: "total", label: "PO Line Total" },
  { key: "notes", label: "Notes" },
];

type VerificationField = (typeof reportFields)[number]["key"];

const quantityFields = new Set<VerificationField>([
  "ordered_quantity",
  "received_quantity",
  "accepted_quantity",
  "rejected_quantity",
]);

const amountFields = new Set<VerificationField>(["price", "cgst_amount", "sgst_amount", "igst_amount", "total"]);
const rateFields = new Set<VerificationField>(["gst", "cgst_rate", "sgst_rate", "igst_rate"]);

const quantity = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const amount = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === ""
    ? "-"
    : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-IN");

export default function GrnVerificationPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn`;
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [stockTasks, setStockTasks] = useState<StockVerificationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleFields, setVisibleFields] = useState<VerificationField[]>(reportFields.map((field) => field.key));
  const [activeSource, setActiveSource] = useState<{ type: "receipt" | "stock"; id: string } | null>(null);
  const [verification, setVerification] = useState<VerificationDetails | null>(null);
  const [verifiedQuantity, setVerifiedQuantity] = useState("");
  const [approvedQuantity, setApprovedQuantity] = useState("");
  const [allocationQuantities, setAllocationQuantities] = useState<Record<string, string>>({});
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [verificationSaved, setVerificationSaved] = useState(false);
  const verificationLoading = activeSource !== null && verification === null && verificationError === "";

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      fetch(`/api/inventory/receipts?organizationId=${encodeURIComponent(organizationId)}`, {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`/api/inventory/grn-verifications?organizationId=${encodeURIComponent(organizationId)}&verificationRegister=true`, {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([receiptsResponse, stockTasksResponse]) => {
        const [receiptData, taskData] = await Promise.all([receiptsResponse.json(), stockTasksResponse.json()]);
        if (!receiptsResponse.ok) throw new Error(receiptData.error || "Unable to load GRN verification report.");
        if (!stockTasksResponse.ok) throw new Error(taskData.error || "Unable to load stock verification tasks.");
        setReceipts(Array.isArray(receiptData.receipts) ? receiptData.receipts : []);
        setStockTasks(Array.isArray(taskData.stockTasks) ? taskData.stockTasks : []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load GRN verification report.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [organizationId]);

  useEffect(() => {
    if (!activeSource) return;
    const controller = new AbortController();
    const sourceQuery = activeSource.type === "stock"
      ? `stockGroupedPurchaseOrderId=${encodeURIComponent(activeSource.id)}`
      : `receiptLineId=${encodeURIComponent(activeSource.id)}`;

    void fetch(`/api/inventory/grn-verifications?organizationId=${encodeURIComponent(organizationId)}&${sourceQuery}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load RM GRN Verification.");
        const details = data.verification as VerificationDetails;
        setVerification(details);
        setVerifiedQuantity(details.verifiedQuantity);
        setApprovedQuantity(details.approvedQuantity);
        setAllocationQuantities(Object.fromEntries(details.allocations.map((allocation) => [
          allocation.groupedPurchaseOrderId,
          allocation.verificationAllocated,
        ])));
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setVerificationError(loadError instanceof Error ? loadError.message : "Unable to load RM GRN Verification.");
        }
      });

    return () => controller.abort();
  }, [activeSource, organizationId]);

  const saveVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSource) return;

    setVerificationSaving(true);
    setVerificationError("");
    setVerificationSaved(false);
    try {
      const response = await fetch("/api/inventory/grn-verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          ...(activeSource.type === "stock"
            ? { sourceGroupedPurchaseOrderId: activeSource.id }
            : { receiptLineId: activeSource.id }),
          verifiedQuantity,
          approvedQuantity,
          ...(activeSource.type === "receipt" ? {
            allocations: Object.entries(allocationQuantities).map(([groupedPurchaseOrderId, value]) => ({
              groupedPurchaseOrderId,
              verificationAllocated: value,
            })),
          } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save RM GRN Verification.");
      setVerificationSaved(true);
      if (activeSource.type === "receipt") {
        setReceipts((current) => current.map((receipt) => ({
          ...receipt,
          lines: receipt.lines.map((line) => line.id === activeSource.id
            ? { ...line, rmGrnVerification: line.rmGrnVerification ?? { id: "saved" } }
            : line),
        })));
      } else {
        setStockTasks((current) => current.filter((task) => task.sourceGroupedPurchaseOrderId !== activeSource.id));
      }
      setActiveSource(null);
    } catch (saveError) {
      setVerificationError(saveError instanceof Error ? saveError.message : "Unable to save RM GRN Verification.");
    } finally {
      setVerificationSaving(false);
    }
  };

  const receiptReportRows: VerificationRow[] = receipts.flatMap((receipt) => {
    const purchaseOrderNo = receipt.purchaseOrder.display_no
      ? `PO-${receipt.purchaseOrder.display_no}`
      : receipt.purchaseOrder.purchase_order_no;
    const lines: Array<ReceiptLine | null> = receipt.lines.length > 0 ? receipt.lines : [null];

    return lines.map((line) => {
      const orderLine = line?.purchaseOrderLine;
      return {
        id: `${receipt.id}:${line?.id ?? "no-lines"}`,
        receiptId: receipt.id,
        receiptLineId: line?.id ?? null,
        sourceGroupedPurchaseOrderId: null,
        isStockIssue: false,
        masterPurchaseOrderId: line?.purchaseOrderLine?.masterPurchaseOrder?.id ?? null,
        isVerified: Boolean(line?.rmGrnVerification),
        verification_status: line?.rmGrnVerification ? "Verified" : "Pending",
        receipt_no: receipt.receipt_no,
        status: receipt.status,
        received_date: receipt.received_date,
        purchase_order_no: purchaseOrderNo,
        entity_name: receipt.entity?.entity_name ?? "Missing Entity",
        location_name: receipt.location?.location_name ?? "Location not set",
        received_by: receipt.received_by ?? "-",
        notes: receipt.notes ?? "-",
        raw_material: line?.raw_material ?? "No raw-material lines",
        category: orderLine?.category ?? "-",
        sub_category: orderLine?.sub_category ?? "-",
        source_order_no: orderLine?.source_order_no ?? "-",
        style_name: orderLine?.style_name ?? "-",
        hsn_code: orderLine?.hsn_code ?? "-",
        ordered_quantity: line?.ordered_quantity ?? null,
        received_quantity: line?.received_quantity ?? null,
        accepted_quantity: line?.accepted_quantity ?? null,
        rejected_quantity: line?.rejected_quantity ?? null,
        price: orderLine?.price ?? null,
        tax_type: orderLine?.tax_type ?? "-",
        gst: orderLine?.gst ?? null,
        cgst_rate: orderLine?.cgst_rate ?? null,
        cgst_amount: orderLine?.cgst_amount ?? null,
        sgst_rate: orderLine?.sgst_rate ?? null,
        sgst_amount: orderLine?.sgst_amount ?? null,
        igst_rate: orderLine?.igst_rate ?? null,
        igst_amount: orderLine?.igst_amount ?? null,
        total: orderLine?.total ?? null,
      };
    });
  });
  const stockReportRows: VerificationRow[] = stockTasks.map((task) => ({
    id: `stock:${task.sourceGroupedPurchaseOrderId}`,
    receiptId: "",
    receiptLineId: null,
    sourceGroupedPurchaseOrderId: task.sourceGroupedPurchaseOrderId,
    isStockIssue: true,
    masterPurchaseOrderId: task.masterPurchaseOrderId,
    receipt_no: task.stockReference,
    status: "Awaiting Store Verification",
    verification_status: "Pending",
    received_date: task.createdAt,
    purchase_order_no: "Internal Store Issue",
    entity_name: task.entityName,
    location_name: "Internal Store",
    received_by: "Internal Store",
    notes: "Physical stock pick is awaiting verification.",
    raw_material: task.rawMaterialName,
    category: task.category ?? "-",
    sub_category: task.subCategory ?? "-",
    source_order_no: "-",
    style_name: "-",
    hsn_code: "-",
    ordered_quantity: task.expectedQuantity,
    received_quantity: task.expectedQuantity,
    accepted_quantity: null,
    rejected_quantity: null,
    price: null,
    tax_type: "-",
    gst: null,
    cgst_rate: null,
    cgst_amount: null,
    sgst_rate: null,
    sgst_amount: null,
    igst_rate: null,
    igst_amount: null,
    total: null,
    isVerified: false,
  }));
  const reportRows = [...receiptReportRows, ...stockReportRows];
  const pendingReportRows = reportRows.filter((row) => !row.isVerified);

  const verifiedValue = Number(verifiedQuantity || 0);
  const approvedValue = Number(approvedQuantity || 0);
  const groupedQtyGrnValue = Number(verification?.groupedQtyGrn ?? 0);
  const rejectedPreview = verifiedValue - approvedValue;
  const freshExcessPreview = Math.max(approvedValue - groupedQtyGrnValue, 0);
  const totalExcessPreview = freshExcessPreview + rejectedPreview;
  const availableToAllocatePreview = verifiedValue - totalExcessPreview;
  const groupedAllocatedPreview = verification?.allocations.reduce(
    (total, allocation) => total + Number(verification.isStockIssue ? approvedQuantity : allocationQuantities[allocation.groupedPurchaseOrderId] ?? allocation.verificationAllocated),
    0,
  ) ?? 0;
  const groupedBalancePreview = verification?.allocations.reduce(
    (total, allocation) => total + Number(allocation.totalGroupedQty) - Number(verification.isStockIssue ? approvedQuantity : allocationQuantities[allocation.groupedPurchaseOrderId] ?? allocation.verificationAllocated),
    0,
  ) ?? 0;
  const allocationExceedsCapacity = verification?.allocations.some(
    (allocation) => Number(verification.isStockIssue ? approvedQuantity : allocationQuantities[allocation.groupedPurchaseOrderId] ?? allocation.verificationAllocated) > Number(allocation.totalGroupedQty),
  ) ?? false;
  const previewQuantity = (value: number) => Number.isFinite(value) ? quantity(value) : "-";
  const fillMatchedAllocation = () => {
    if (!verification || verification.isStockIssue) return;
    let remaining = Math.max(availableToAllocatePreview - groupedAllocatedPreview, 0);
    setAllocationQuantities((current) => {
      const next = { ...current };
      for (const allocation of verification.allocations) {
        if (remaining <= 0) break;
        const currentQuantity = Number(next[allocation.groupedPurchaseOrderId] ?? allocation.verificationAllocated);
        const capacity = Number(allocation.totalGroupedQty);
        const fillQuantity = Math.min(Math.max(capacity - currentQuantity, 0), remaining);
        next[allocation.groupedPurchaseOrderId] = String(currentQuantity + fillQuantity);
        remaining = Math.max(remaining - fillQuantity, 0);
      }
      return next;
    });
  };

  return (
    <UiPage as="div" className="px-1 py-1 sm:px-2 lg:px-2">
      <Section className="space-y-2">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Inventory / Inward</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">GRN Verification Report</h1>
          </div>
          <nav className="flex gap-3 text-sm font-semibold">
            <Link href={`${basePath}/report`} className="text-emerald-800 hover:text-emerald-950">GRN Report</Link>
            <Link href={`${basePath}/create`} className="text-emerald-800 hover:text-emerald-950">Create GRN</Link>
          </nav>
        </header>

        {loading ? (
          <Card className="p-3 text-sm text-slate-600">Loading GRN verification report...</Card>
        ) : error ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
        ) : (
          <div className="erp-surface overflow-hidden">
            <ReportGrid
              title="GRN Verification Register"
              records={pendingReportRows}
              fields={reportFields}
              visibleFields={visibleFields}
              onVisibleFieldsChange={(next) => setVisibleFields(next as VerificationField[])}
              rowIdSelector={(row) => row.id}
              selectedIds={[]}
              selectable={false}
              storageKey={`grn-verification-columns-${organizationId}`}
              onRowAction={(recordId) => {
                const row = reportRows.find((record) => record.id === recordId);
                if (!row || (!row.receiptLineId && !row.sourceGroupedPurchaseOrderId)) return;
                setVerification(null);
                setVerifiedQuantity("");
                setApprovedQuantity("");
                setAllocationQuantities({});
                setVerificationError("");
                setVerificationSaved(false);
                setActiveSource(row.isStockIssue
                  ? { type: "stock", id: row.sourceGroupedPurchaseOrderId! }
                  : { type: "receipt", id: row.receiptLineId! });
              }}
              rowActionLabel="Verify / Confirm"
              rowActionDisabledSelector={(row) => (!row.receiptLineId && !row.sourceGroupedPurchaseOrderId) || !row.masterPurchaseOrderId || row.isVerified}
              onRowClick={(recordId) => {
                const row = reportRows.find((record) => record.id === recordId);
                if (row?.receiptId) router.push(`${basePath}/report/${encodeURIComponent(row.receiptId)}`);
              }}
              renderCell={(fieldKey, row) => {
                const field = fieldKey as VerificationField;
                const value = row[field];
                if (field === "received_date") return formatDate(String(value));
                if (quantityFields.has(field)) return value == null ? "-" : quantity(value);
                if (amountFields.has(field)) return amount(value);
                if (rateFields.has(field)) return value == null ? "-" : `${amount(value)}%`;
                return String(value ?? "-");
              }}
              emptyMessage="No GRN or stock verification tasks found."
            />
          </div>
        )}
      </Section>
      <Modal
        open={activeSource !== null}
        onClose={() => setActiveSource(null)}
        ariaLabelledBy="rm-grn-verification-title"
        size="xl"
        className="p-0"
      >
        <form onSubmit={(event) => void saveVerification(event)}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 id="rm-grn-verification-title" className="text-sm font-bold text-slate-900">{verification?.isStockIssue ? "Store Stock Verification" : "GRN Verification"}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setActiveSource(null)} aria-label="Close RM GRN Verification">
              Close
            </Button>
          </div>
          <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
            {verificationError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{verificationError}</div>}
            {verificationLoading ? (
              <p className="text-sm text-slate-500">Loading GRN and grouping details...</p>
            ) : verification ? (
              <>
                <section aria-label="GRN Verification header fields" className="space-y-3">
                  <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">Master Group *</p><p className="mt-1 text-xs font-semibold text-slate-900">{verification.masterGroupingNumber}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">{verification.isStockIssue ? "Stock Reference" : "GRN No"}</p><p className="mt-1 text-xs font-semibold text-slate-900">{verification.grnNumber}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">{verification.isStockIssue ? "Source" : "Purchase Order"}</p><p className="mt-1 text-xs font-semibold text-slate-900">{verification.purchaseOrderNumber}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">Raw Material</p><p className="mt-1 text-xs font-semibold text-slate-900">{verification.rawMaterialName || "-"}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">{verification.isStockIssue ? "Master Group Qty" : "PO Qty"}</p><p className="mt-1 text-xs font-semibold text-slate-900">{quantity(verification.poQuantity)}</p></div>
                    <Input
                      label="Verified Qty"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      required
                      value={verifiedQuantity}
                      onChange={(event) => setVerifiedQuantity(event.target.value)}
                      disabled={verificationSaving}
                    />
                    <Input
                      label="Approved Qty"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      required
                      value={approvedQuantity}
                      onChange={(event) => setApprovedQuantity(event.target.value)}
                      disabled={verificationSaving}
                    />
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">Rejected · tracked separately</p><p className="mt-1 text-xs font-semibold text-amber-800">{previewQuantity(rejectedPreview)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">Approved excess · General Inventory</p><p className="mt-1 text-xs font-semibold text-emerald-800">{previewQuantity(freshExcessPreview)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">Total excess to reconcile</p><p className="mt-1 text-xs font-semibold text-slate-900">{previewQuantity(totalExcessPreview)}</p></div>
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2"><p className="text-[10px] font-semibold uppercase text-blue-800">Matched qty · style/order allocation</p><p className="mt-1 text-sm font-bold tabular-nums text-blue-950">{previewQuantity(availableToAllocatePreview)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">Grouped Allocated</p><p className="mt-1 text-xs font-semibold text-slate-900">{previewQuantity(groupedAllocatedPreview)}</p></div>
                    <div><p className="text-[10px] font-semibold uppercase text-slate-500">Grouped Balance to Allocate</p><p className="mt-1 text-xs font-semibold text-slate-900">{previewQuantity(groupedBalancePreview)}</p></div>
                  </div>
                </section>
                <section aria-label="GRN Verification allocation subform" className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">RM GRN Verification Subform</h3>
                      <p className="mt-1 text-[11px] text-slate-500">Only matched approved quantity can move to style/order allocation. Excess is kept in General Inventory.</p>
                    </div>
                    {!verification.isStockIssue && (
                      <Button type="button" variant="secondary" size="sm" onClick={fillMatchedAllocation} disabled={verificationSaving || availableToAllocatePreview <= groupedAllocatedPreview}>
                        Fill matched quantity
                      </Button>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Grouping No</th>
                          <th className="px-3 py-2 text-right">Total Grouped Qty</th>
                          <th className="px-3 py-2 text-right">Verification Allocated</th>
                          <th className="px-3 py-2 text-right">Balance to Allocate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {verification.allocations.map((allocation) => {
                          const allocated = Number(allocationQuantities[allocation.groupedPurchaseOrderId] ?? allocation.verificationAllocated);
                          const balance = Number(allocation.totalGroupedQty) - allocated;
                          return (
                            <tr key={allocation.groupedPurchaseOrderId}>
                              <td className="px-3 py-2 font-semibold text-slate-800">{allocation.groupingNumber}</td>
                              <td className="px-3 py-2 text-right">{quantity(allocation.totalGroupedQty)}</td>
                              <td className="w-44 px-3 py-2">
                                {verification.isStockIssue ? (
                                  <span className="block py-2 text-right font-semibold text-slate-800">{quantity(approvedQuantity)}</span>
                                ) : (
                                  <Input
                                    aria-label={`Verification Allocated for ${allocation.groupingNumber}`}
                                    type="number"
                                    min="0"
                                    max={allocation.totalGroupedQty}
                                    step="0.01"
                                    inputMode="decimal"
                                    value={allocationQuantities[allocation.groupedPurchaseOrderId] ?? allocation.verificationAllocated}
                                    onChange={(event) => setAllocationQuantities((current) => ({
                                      ...current,
                                      [allocation.groupedPurchaseOrderId]: event.target.value,
                                    }))}
                                    disabled={verificationSaving}
                                  />
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">{previewQuantity(balance)}</td>
                            </tr>
                          );
                        })}
                        {verification.allocations.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No Grouped PO rows are linked to this Master Group.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {approvedValue > verifiedValue && (
                    <p role="alert" className="text-xs text-red-700">Approved Qty cannot exceed Verified Qty.</p>
                  )}
                  {groupedAllocatedPreview > availableToAllocatePreview && (
                    <p role="alert" className="text-xs text-red-700">Grouped Allocated cannot exceed Available To Allocate.</p>
                  )}
                  {allocationExceedsCapacity && (
                    <p role="alert" className="text-xs text-red-700">A grouping allocation exceeds its available balance.</p>
                  )}
                  {groupedAllocatedPreview < availableToAllocatePreview && (
                    <p className="text-[11px] text-slate-500">Unassigned matched quantity: {previewQuantity(availableToAllocatePreview - groupedAllocatedPreview)}. You can enter group amounts or fill remaining group capacity.</p>
                  )}
                </section>
              </>
            ) : null}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p aria-live="polite" className="text-xs font-medium text-emerald-700">{verificationSaved ? "Verification saved." : ""}</p>
            <Button type="submit" size="sm" disabled={!verification || !verification.masterPurchaseOrderId || verificationLoading || verificationSaving || approvedValue > verifiedValue || groupedAllocatedPreview > availableToAllocatePreview || allocationExceedsCapacity}>
              {verificationSaving ? "Submitting..." : verification?.isStockIssue ? "Submit Store Verification" : "Save Verification"}
            </Button>
          </div>
        </form>
      </Modal>
    </UiPage>
  );
}