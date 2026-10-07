"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Boxes, ClipboardList, Plus } from "lucide-react";
import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";

type InventoryStage = "purchase-order" | "packing-list-grn" | "wo-grn" | "returnable-dc-grn" | "raw-material-dc" | "rm-stock" | "fg-stock";

type PurchaseOrder = {
  id: string;
  purchaseOrderNo: string;
  vendor: { name: string };
  status: string;
  deliveryDate: string | null;
  total: number;
  lines: Array<{ rawMaterial: string | null; quantity: number | null; total: number | null }>;
};

type StockRow = {
  id: string;
  raw_material?: string;
  style_name?: string;
  size?: string | null;
  location: { location_name: string };
  quantity_on_hand: number | string;
  quantity_reserved: number | string;
  quantity_issued: number | string;
  source_type?: string;
  receipt_no?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  fresh_excess?: number | string;
  rejected_quantity?: number | string;
  total_excess?: number | string;
};

type BookedStockRow = {
  id: string;
  takeFromStockId: string;
  currentStoreVendor: string;
  rawMaterial: string;
  location: string;
  entity: string;
  orderNo: string;
  styleName: string | null;
  bookedQuantity: number;
  fulfilledQuantity: number;
  status: string;
  bookedBy: string | null;
  bookedAt: string;
};

type StockMasterOption = { id: string; label: string };

type ManualStockForm = {
  rawMaterialId: string;
  locationId: string;
  quantity: string;
  reason: string;
};

const emptyManualStockForm = (): ManualStockForm => ({ rawMaterialId: "", locationId: "", quantity: "", reason: "" });

const bookedStockFields = [
  { key: "id", label: "Booking ID" },
  { key: "takeFromStockId", label: "Take from Stock ID" },
  { key: "currentStoreVendor", label: "Current Store Vendor" },
  { key: "entity", label: "Entity" },
  { key: "location", label: "Location" },
  { key: "rawMaterial", label: "Raw Material" },
  { key: "orderNo", label: "Order No." },
  { key: "styleName", label: "Style" },
  { key: "bookedQuantity", label: "Booked Qty" },
  { key: "fulfilledQuantity", label: "Physically Approved Qty" },
  { key: "status", label: "Status" },
  { key: "bookedBy", label: "Booked By" },
  { key: "bookedAt", label: "Booked At" },
];

const stageDetails: Record<InventoryStage, { eyebrow: string; title: string; description: string; next?: { label: string; path: string } }> = {
  "purchase-order": {
    eyebrow: "Inventory / Inward",
    title: "RM GRN",
    description: "Receive approved Purchase Orders into inventory with traceable line quantities and pending receipt balances.",
    next: { label: "Open Raw Material DC", path: "../outward/raw-material-dc" },
  },
  "packing-list-grn": {
    eyebrow: "Inventory / Inward",
    title: "Packing List GRN",
    description: "Register incoming packing-list materials with document-level traceability and organization-scoped receiving controls.",
  },
  "wo-grn": {
    eyebrow: "Inventory / Inward",
    title: "WO GRN",
    description: "Register work-order receipts against the organization inventory ledger with a dedicated document flow.",
  },
  "returnable-dc-grn": {
    eyebrow: "Inventory / Inward",
    title: "Returnable DC GRN",
    description: "Register returnable delivery challan receipts separately from raw-material receiving for auditable inward control.",
  },
  "raw-material-dc": {
    eyebrow: "Inventory / Outward",
    title: "Raw Material Delivery Challans",
    description: "Record raw material issues and transfers with source document, destination, quantity, and acknowledgement status.",
    next: { label: "View RM Stock", path: "stock/rm-stock/general-inventory" },
  },
  "rm-stock": {
    eyebrow: "Inventory / Stock",
    title: "General Inventory",
    description: "Monitor raw material on-hand, reserved, issued, and available quantities by item and location.",
    next: { label: "View FG Stock", path: "stock/fg-stock" },
  },
  "fg-stock": {
    eyebrow: "Inventory / Stock",
    title: "FG Stock",
    description: "Monitor finished-goods receipts, allocations, dispatches, and available stock by style, size, and order.",
  },
};

export default function InventoryStagePage({ stage }: { stage: InventoryStage }) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? ""}/organizations/${organizationId}/inventory-management`;
  const details = stageDetails[stage];
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [bookedStock, setBookedStock] = useState<BookedStockRow[]>([]);
  const [bookedLoading, setBookedLoading] = useState(stage === "rm-stock");
  const [bookedError, setBookedError] = useState("");
  const [stockTab, setStockTab] = useState("general");
  const [manualStockOpen, setManualStockOpen] = useState(false);
  const [manualStockForm, setManualStockForm] = useState<ManualStockForm>(emptyManualStockForm);
  const [rawMaterialOptions, setRawMaterialOptions] = useState<StockMasterOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<StockMasterOption[]>([]);
  const [manualOptionsLoading, setManualOptionsLoading] = useState(false);
  const [manualStockSaving, setManualStockSaving] = useState(false);
  const [manualStockError, setManualStockError] = useState("");
  const [loading, setLoading] = useState(stage === "purchase-order" || (stage.endsWith("stock") && stage !== "fg-stock"));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) return;
    if (stage.endsWith("stock") && stage !== "fg-stock") {
      fetch(`/api/inventory/stock?organizationId=${encodeURIComponent(organizationId)}&type=RM`, { cache: "no-store" })
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Unable to load stock."); setStock(data.stock ?? []); })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load stock."))
        .finally(() => setLoading(false));
      if (stage === "rm-stock") {
        fetch(`/api/inventory/booked-stock?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
          .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Unable to load booked stock."); setBookedStock(data.bookings ?? []); })
          .catch((loadError) => setBookedError(loadError instanceof Error ? loadError.message : "Unable to load booked stock."))
          .finally(() => setBookedLoading(false));
      }
      return;
    }
    if (stage !== "purchase-order") return;
    fetch(`/api/orders/purchase-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load Purchase Orders.");
        setPurchaseOrders(data.purchaseOrders ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders."))
      .finally(() => setLoading(false));
  }, [organizationId, stage]);

  const metrics = useMemo(() => ({
    documents: purchaseOrders.length,
    approved: purchaseOrders.filter((order) => order.status === "APPROVED").length,
    lines: purchaseOrders.reduce((total, order) => total + order.lines.length, 0),
  }), [purchaseOrders]);

  async function openManualStockForm() {
    setManualStockForm(emptyManualStockForm());
    setManualStockError("");
    setManualStockOpen(true);
    setManualOptionsLoading(true);
    try {
      const [materialsResponse, locationsResponse] = await Promise.all([
        fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/raw-material?includeInactive=false&limit=200`, { cache: "no-store" }),
        fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/location?includeInactive=false&limit=200`, { cache: "no-store" }),
      ]);
      const [materialsPayload, locationsPayload] = await Promise.all([materialsResponse.json(), locationsResponse.json()]);
      if (!materialsResponse.ok) throw new Error(materialsPayload?.error || "Unable to load raw materials.");
      if (!locationsResponse.ok) throw new Error(locationsPayload?.error || "Unable to load locations.");
      setRawMaterialOptions(Array.isArray(materialsPayload) ? materialsPayload.map((item: { id: string; label: string }) => ({ id: item.id, label: item.label })) : []);
      setLocationOptions(Array.isArray(locationsPayload) ? locationsPayload.map((item: { id: string; label: string }) => ({ id: item.id, label: item.label })) : []);
    } catch (loadError) {
      setManualStockError(loadError instanceof Error ? loadError.message : "Unable to load stock form options.");
    } finally {
      setManualOptionsLoading(false);
    }
  }

  async function submitManualStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualStockSaving(true);
    setManualStockError("");
    try {
      const response = await fetch("/api/inventory/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...manualStockForm }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to add stock.");

      setManualStockOpen(false);
      try {
        const stockResponse = await fetch(`/api/inventory/stock?organizationId=${encodeURIComponent(organizationId)}&type=RM`, { cache: "no-store" });
        const stockPayload = await stockResponse.json();
        if (!stockResponse.ok) throw new Error(stockPayload?.error || "Unable to refresh inventory.");
        setStock(stockPayload.stock ?? []);
      } catch (refreshError) {
        const detail = refreshError instanceof Error ? ` ${refreshError.message}` : "";
        setError(`Stock was added, but the inventory list could not be refreshed.${detail}`);
      }
    } catch (saveError) {
      setManualStockError(saveError instanceof Error ? saveError.message : "Unable to add stock.");
    } finally {
      setManualStockSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-5">
      {stage === "fg-stock" ? (
        <>
          <header className="border-b border-[var(--erp-border)] pb-4">
            <p className="erp-eyebrow">{details.eyebrow}</p>
            <h1 className="erp-page-heading mt-1">{details.title}</h1>
            <p className="erp-page-subheading mt-1">{details.description}</p>
          </header>
          <section aria-label="Finished goods stock views" className="grid gap-4 sm:grid-cols-2">
            {[
              {
                label: "General Stock",
                description: "View all finished-goods stock records, quantities, and locations.",
                href: `${basePath}/stock/fg-stock/general-stock`,
                Icon: Boxes,
              },
              {
                label: "Allocated Stock",
                description: "View finished-goods stock linked to an order.",
                href: `${basePath}/stock/fg-stock/allocated-stock`,
                Icon: ClipboardList,
              },
            ].map(({ label, description, href, Icon }) => (
              <Link key={label} href={href} className="group block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-brand)]">
                <Card className="flex min-h-48 h-full flex-col justify-between transition group-hover:border-[var(--erp-brand)] group-hover:shadow-md">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="mt-8 block">
                    <span className="flex items-center justify-between gap-3 text-lg font-bold text-[var(--erp-text)]">
                      {label}
                      <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--erp-muted)] transition group-hover:translate-x-1 group-hover:text-[var(--erp-brand)]" />
                    </span>
                    <span className="mt-2 block max-w-md text-sm leading-6 text-[var(--erp-muted)]">{description}</span>
                  </span>
                </Card>
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {stage !== "fg-stock" ? (
        <>
      {stage !== "rm-stock" ? (
        <header className="border-b border-slate-200 pb-4">
          <p className="erp-eyebrow">{details.eyebrow}</p>
          <h1 className="erp-page-heading mt-1">{details.title}</h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">{details.description}</p>
        </header>
      ) : null}

      {stage !== "rm-stock" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Documents", stage === "purchase-order" ? metrics.documents : "0"],
            ["Approved / Available", stage === "purchase-order" ? metrics.approved : "0"],
            ["Traceable Lines", stage === "purchase-order" ? metrics.lines : "0"],
          ].map(([label, value]) => (
            <section key={label} className="erp-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
            </section>
          ))}
        </div>
      ) : null}

      {details.next && stage !== "rm-stock" ? (
        <Link href={`${basePath}/${details.next.path}`} className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">
          {details.next.label} →
        </Link>
      ) : null}

      {stage === "purchase-order" ? (
        loading ? <div className="erp-surface p-8 text-center text-xs text-slate-500">Loading GRNs...</div> :
          error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> :
            <div className="erp-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-3">PO No.</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3">Lines</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseOrders.map((order) => (
                      <tr key={order.id} className="bg-white hover:bg-emerald-50">
                        <td className="px-3 py-3 font-bold text-slate-900">{order.purchaseOrderNo}</td>
                        <td className="px-3 py-3">{order.vendor.name}</td>
                        <td className="px-3 py-3">{order.lines.length}</td>
                        <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold">{order.status}</span></td>
                        <td className="px-3 py-3 text-right"><Link className="font-bold text-emerald-700 hover:underline" href={`${basePath}/inward/grn/${order.id}`}>Open receipt</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {purchaseOrders.length === 0 ? <p className="p-8 text-center text-xs text-slate-500">No GRNs are available for inward processing.</p> : null}
            </div>
      ) : stage.endsWith("stock") ? (
        <>
          {stage === "rm-stock" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <Tabs
                  ariaLabel="RM stock views"
                  tabs={[{ label: "General Inventory", value: "general" }, { label: "Booked Stock", value: "booked" }]}
                  value={stockTab}
                  onChange={setStockTab}
                />
              </div>
              {stockTab === "general" && <Button type="button" onClick={() => { void openManualStockForm(); }}><Plus className="h-4 w-4" />Create New</Button>}
            </div>
          )}
          {stage === "rm-stock" && stockTab === "booked" ? (
            bookedLoading ? <div className="erp-surface p-8 text-center text-xs text-slate-500">Loading booked stock...</div>
              : bookedError ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{bookedError}</div>
                : <BookedStockReport records={bookedStock} />
          ) : loading ? <div className="erp-surface p-8 text-center text-xs text-slate-500">Loading stock...</div> : error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> :
            <div className="erp-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1450px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Raw Material</th>
                      <th className="px-3 py-3">Size</th>
                      <th className="px-3 py-3">Location</th>
                      <th className="px-3 py-3">Source</th>
                      <th className="px-3 py-3">GRN No.</th>
                      <th className="px-3 py-3">Entry Date</th>
                      <th className="px-3 py-3 text-right">On Hand</th>
                      <th className="px-3 py-3 text-right">Fresh Excess</th>
                      <th className="px-3 py-3 text-right">Rejected Qty</th>
                      <th className="px-3 py-3 text-right">Total Excess</th>
                      <th className="px-3 py-3 text-right">Reserved</th>
                      <th className="px-3 py-3 text-right">Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stock.map((row) => {
                      const onHand = Number(row.quantity_on_hand);
                      const reserved = Number(row.quantity_reserved);
                      return (
                        <tr key={row.id} className="bg-white">
                          <td className="px-3 py-3 font-semibold text-slate-900">{row.raw_material ?? row.style_name}</td>
                          <td className="px-3 py-3">{row.size ?? "-"}</td>
                          <td className="px-3 py-3">{row.location.location_name}</td>
                          <td className="px-3 py-3">{row.source_type === "GRN" ? "GRN" : row.source_type === "MANUAL" ? "Manual Entry" : "Legacy Balance"}</td>
                          <td className="px-3 py-3">{row.receipt_no ?? "-"}</td>
                          <td className="px-3 py-3">{row.received_at || row.created_at ? new Date(row.received_at ?? row.created_at!).toLocaleDateString("en-IN") : "-"}</td>
                          <td className="px-3 py-3 text-right">{onHand.toLocaleString("en-IN")}</td>
                          <td className="px-3 py-3 text-right">{Number(row.fresh_excess ?? 0).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-3 text-right">{Number(row.rejected_quantity ?? 0).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-3 text-right">{Number(row.total_excess ?? 0).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-3 text-right">{reserved.toLocaleString("en-IN")}</td>
                          <td className="px-3 py-3 text-right font-bold text-emerald-700">{(onHand - reserved).toLocaleString("en-IN")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {stock.length === 0 ? <p className="p-8 text-center text-xs text-slate-500">No stock has been posted for this ledger yet.</p> : null}
            </div>}
        </>
      ) : (
        <section className="erp-surface p-8">
          <p className="text-sm font-semibold text-slate-900">{details.title} workspace ready</p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">This document flow is organization-scoped and ready for its source-document fields, line items, approvals, and posting controls.</p>
        </section>
      )}
        </>
      ) : null}

      <Modal
        open={manualStockOpen}
        onClose={() => { if (!manualStockSaving) setManualStockOpen(false); }}
        ariaLabelledBy="manual-stock-dialog-title"
        size="md"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="manual-stock-dialog-title" className="text-base font-bold text-slate-950">Add Raw Material Stock</h2>
          <p className="mt-1 text-xs text-slate-500">Stock will be added to the selected location.</p>
        </div>
        <form onSubmit={submitManualStock} className="space-y-4 p-5">
          {manualOptionsLoading ? <p className="text-sm text-slate-500">Loading materials and locations...</p> : (
            <>
              <Select
                label="Raw Material"
                value={manualStockForm.rawMaterialId}
                onChange={(event) => setManualStockForm((current) => ({ ...current, rawMaterialId: event.target.value }))}
                required
                disabled={rawMaterialOptions.length === 0}
              >
                <option value="">Select a raw material</option>
                {rawMaterialOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </Select>
              <Select
                label="Location"
                value={manualStockForm.locationId}
                onChange={(event) => setManualStockForm((current) => ({ ...current, locationId: event.target.value }))}
                required
                disabled={locationOptions.length === 0}
              >
                <option value="">Select a location</option>
                {locationOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </Select>
              <Input
                label="Quantity to Add"
                type="number"
                min="0.01"
                step="0.01"
                value={manualStockForm.quantity}
                onChange={(event) => setManualStockForm((current) => ({ ...current, quantity: event.target.value }))}
                required
              />
              <Input
                label="Reason"
                value={manualStockForm.reason}
                onChange={(event) => setManualStockForm((current) => ({ ...current, reason: event.target.value }))}
                maxLength={500}
                placeholder="For example, opening balance"
                required
              />
            </>
          )}
          {manualStockError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{manualStockError}</p>}
          {!manualOptionsLoading && (rawMaterialOptions.length === 0 || locationOptions.length === 0) && !manualStockError && (
            <p className="text-sm text-slate-500">An active raw material and location are required before stock can be added.</p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={() => setManualStockOpen(false)} disabled={manualStockSaving}>Cancel</Button>
            <Button type="submit" disabled={manualStockSaving || manualOptionsLoading || rawMaterialOptions.length === 0 || locationOptions.length === 0}>
              {manualStockSaving ? "Adding..." : "Add Stock"}
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}

function BookedStockReport({ records }: { records: BookedStockRow[] }) {
  const [visibleFields, setVisibleFields] = useState(bookedStockFields.map((field) => field.key));
  return <ReportGrid
    title="Booked Stock Report"
    records={records}
    fields={bookedStockFields}
    visibleFields={visibleFields}
    onVisibleFieldsChange={setVisibleFields}
    rowIdSelector={(record) => record.id}
    selectedIds={[]}
    selectable={false}
    onRowClick={() => undefined}
    renderCell={(fieldKey, record) => {
      if (fieldKey === "bookedQuantity") return Number(record.bookedQuantity).toLocaleString("en-IN", { maximumFractionDigits: 2 });
      if (fieldKey === "bookedAt") return new Date(record.bookedAt).toLocaleString("en-IN");
      return String(record[fieldKey as keyof BookedStockRow] ?? "-");
    }}
    emptyMessage="No booked stock records found."
  />;
}