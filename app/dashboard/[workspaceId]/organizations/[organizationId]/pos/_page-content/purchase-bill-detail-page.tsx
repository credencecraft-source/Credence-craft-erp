"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, QrCode } from "lucide-react";

import PurchaseBillQrRequestModal from "./purchase-bill-qr-request-modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";


type BillLine = {
  id: string;
  itemName: string | null;
  size: string | null;
  quantity: string;
  purchasePrice: string | null;
  gstRate: string | null;
  hsnCode: string | null;
  taxAmount: string;
  total: string;
  sourceRecord: { recordNumber: string; itemType: string; styleName: string | null; brandId: string | null; sizeGroupId: string | null; colorId: string | null; categoryId: string | null; subCategoryId: string | null } | null;
  stock: { id: string; sku_code: string | null } | null;
};

type Bill = {
  id: string;
  documentNumber: string;
  entityId: string | null;
  entityName: string | null;
  billNumber: string;
  billDate: string;
  taxMode: string;
  status: string;
  totalQuantity: string;
  subtotal: string;
  tax: string;
  total: string;
  createdAt: string;
  postedAt: string | null;
  vendor: { id: string; vendor: string; gst_number: string | null; registered_state: string | null };
  lines: BillLine[];
};

type LocationLookupOption = { id: string; label: string };
type StockLeafOption = { id: string; label: string };

function isLocationLookupOption(value: unknown): value is LocationLookupOption {
  return typeof value === "object" && value !== null
    && "id" in value && typeof value.id === "string"
    && "label" in value && typeof value.label === "string";
}

const money = (value: string | number | null | undefined) => `Rs ${Number(value ?? 0).toFixed(2)}`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString() : "-";
export default function PurchaseBillDetailPage({ workspaceId, organizationId, billId }: { workspaceId: string; organizationId: string; billId: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [qrRequestHref, setQrRequestHref] = useState("");
  const [showQrRequest, setShowQrRequest] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [locations, setLocations] = useState<LocationLookupOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [stockLeafOptions, setStockLeafOptions] = useState<StockLeafOption[]>([]);
  const [selectedStorageNodeId, setSelectedStorageNodeId] = useState("");
  const [loadingStockLeaves, setLoadingStockLeaves] = useState(false);
  const [stockLeafError, setStockLeafError] = useState("");
  const [stockLeafRetry, setStockLeafRetry] = useState(0);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState("");
  const locationRequest = useRef<AbortController | null>(null);
  const locationMasterTabOpened = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/${encodeURIComponent(billId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load purchase bill.");
    setBill(data.bill);
  }, [billId, organizationId]);
  const closeQrRequest = useCallback(() => setShowQrRequest(false), []);
  const submitQrRequest = useCallback((successMessage: string, requestId: string) => {
    setShowQrRequest(false);
    setError("");
    setMessage(successMessage);
    setQrRequestHref(
      `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/design-development/barcode-qr-code/print-download/${encodeURIComponent(requestId)}`,
    );
  }, [organizationId, workspaceId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load()
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load purchase bill."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const billEntityId = bill?.entityId;
  const loadActiveLocations = useCallback(async () => {
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    setLoadingLocations(true);
    setLocationLookupError("");
    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/master-data/location?includeInactive=false&limit=200${billEntityId ? `&entityId=${encodeURIComponent(billEntityId)}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      const result: unknown = await response.json();
      if (!response.ok || !Array.isArray(result)) {
        const apiError = typeof result === "object" && result !== null && "error" in result
          ? String(result.error)
          : "Unable to load active stock locations.";
        throw new Error(apiError);
      }
      const activeLocations = result.filter(isLocationLookupOption);
      setLocations(activeLocations);
      setSelectedLocationId((current) =>
        activeLocations.some((location) => location.id === current) ? current : "",
      );
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setLocationLookupError(loadError instanceof Error ? loadError.message : "Unable to load active stock locations.");
      }
    } finally {
      if (locationRequest.current === controller) {
        locationRequest.current = null;
        setLoadingLocations(false);
      }
    }
  }, [billEntityId, organizationId]);

  useEffect(() => () => locationRequest.current?.abort(), []);

  useEffect(() => {
    if (!showLocationPrompt || !selectedLocationId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ nodeType: "SUB_STORE", limit: "500" });
    if (billEntityId) query.set("siteEntityId", billEntityId);
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/storage-nodes?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as {
          error?: string;
          nodes?: Array<{ id?: unknown; is_active?: unknown; fields?: Record<string, unknown> }>;
        };
        if (!response.ok || !Array.isArray(data.nodes)) throw new Error(data.error || "Unable to load active POS issue locations.");
        return data.nodes
          .filter((node) => node.is_active === true && typeof node.id === "string"
            && node.fields?.site_location_id === selectedLocationId
            && typeof node.fields.path === "string")
          .map((node) => ({ id: node.id as string, label: node.fields?.path as string }));
      })
      .then((options) => { if (!controller.signal.aborted) setStockLeafOptions(options); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setStockLeafError(cause instanceof Error ? cause.message : "Unable to load active POS issue locations.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingStockLeaves(false); });
    return () => controller.abort();
  }, [billEntityId, organizationId, selectedLocationId, showLocationPrompt, stockLeafRetry]);

  useEffect(() => {
    if (!showLocationPrompt) return;
    const refreshAfterLocationCreate = () => {
      if (!locationMasterTabOpened.current) return;
      locationMasterTabOpened.current = false;
      void loadActiveLocations();
    };
    window.addEventListener("focus", refreshAfterLocationCreate);
    return () => window.removeEventListener("focus", refreshAfterLocationCreate);
  }, [loadActiveLocations, showLocationPrompt]);

  const openLocationPrompt = () => {
    setError("");
    setLocationLookupError("");
    setSelectedStorageNodeId("");
    setStockLeafOptions([]);
    setStockLeafError("");
    setLoadingStockLeaves(Boolean(selectedLocationId));
    setShowLocationPrompt(true);
    void loadActiveLocations();
  };

  const groupedRecords = useMemo(() => {
    if (!bill) return [];
    const groups = new Map<string, { recordNumber: string; styleName: string; itemType: string; lines: BillLine[] }>();
    for (const line of bill.lines) {
      const record = line.sourceRecord;
      const key = record?.recordNumber ?? line.id;
      const existing = groups.get(key);
      if (existing) existing.lines.push(line);
      else groups.set(key, { recordNumber: record?.recordNumber ?? "Unassigned", styleName: record?.styleName ?? line.itemName ?? "-", itemType: record?.itemType ?? "-", lines: [line] });
    }
    return [...groups.values()];
  }, [bill]);

  const createStock = async () => {
    if (!bill || !selectedLocationId || !selectedStorageNodeId) {
      setLocationLookupError("Select an active location and Sub-sub-location before creating POS stock.");
      return;
    }
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/${encodeURIComponent(billId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-stock",
          locationId: selectedLocationId,
          storageNodeId: selectedStorageNodeId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create Finished Goods stock.");
      setBill(data.bill);
      setMessage("Approved and created Finished Goods stock from this POS purchase bill.");
      setQrRequestHref("");
      setShowLocationPrompt(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to create Finished Goods stock.");
    } finally { setWorking(false); }
  };

  return <Page as="div"><Section className="space-y-5">
    {loading ? <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading purchase bill details...</div> : error && !bill ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : bill ? <>
      <header className="erp-page-header items-start"><div><p className="erp-eyebrow">POS Purchase Bill</p><h1 className="erp-page-heading mt-0.5">{bill.documentNumber}</h1><p className="mt-0.5 text-xs text-slate-500">Supplier bill {bill.billNumber} · {date(bill.billDate)} · {bill.status}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => setShowQrRequest(true)} disabled={!bill.lines.length}><QrCode className="h-4 w-4" aria-hidden="true" /> Request item barcodes</Button><Button type="button" onClick={openLocationPrompt} disabled={working || bill.lines.every((line) => Boolean(line.stock))} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">{working ? "Creating stock..." : bill.lines.every((line) => Boolean(line.stock)) ? "Stock Created" : "Approve & Create Stock"}</Button></div></header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><span>{message}</span>{qrRequestHref && <Link href={qrRequestHref} className="shrink-0 text-xs font-semibold text-[var(--erp-brand)] underline underline-offset-2 hover:text-[var(--erp-brand-hover)]">View barcode request</Link>}</div>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Vendor</p><p className="mt-2 font-bold text-slate-950">{bill.vendor.vendor}</p><p className="mt-1 text-xs text-slate-500">GSTIN {bill.vendor.gst_number || "-"}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Entity</p><p className="mt-2 font-bold text-slate-950">{bill.entityName || "Legacy bill — assigned when stock is created"}</p><p className="mt-1 text-xs text-slate-500">Bill date {date(bill.billDate)}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Quantity</p><p className="mt-2 font-bold text-slate-950">{bill.totalQuantity}</p><p className="mt-1 text-xs text-slate-500">{bill.lines.length} item lines</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-500">Taxable Amount</p><p className="mt-2 font-bold text-slate-950">{money(bill.subtotal)}</p><p className="mt-1 text-xs text-slate-500">Tax mode {bill.taxMode}</p></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-[10px] font-bold uppercase text-emerald-700">Bill Total</p><p className="mt-2 text-lg font-bold text-emerald-900">{money(bill.total)}</p><p className="mt-1 text-xs text-emerald-700">GST {money(bill.tax)}</p></div></section>
      <div className="space-y-4">{groupedRecords.map((group) => <section key={group.recordNumber} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Purchase Bill Item Group</p><h2 className="mt-1 font-bold text-slate-950">{group.recordNumber} · {group.styleName}</h2></div><span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700">{group.itemType.replaceAll("_", " ")}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Size</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Purchase Price</th><th className="px-4 py-3 text-right">GST</th><th className="px-4 py-3">HSN</th><th className="px-4 py-3">Stock</th></tr></thead><tbody className="divide-y divide-slate-100">{group.lines.map((line) => <tr key={line.id}><td className="px-4 py-3 font-semibold text-slate-950">{line.itemName || group.styleName}</td><td className="px-4 py-3 text-slate-700">{line.size || "-"}</td><td className="px-4 py-3 text-right font-bold">{line.quantity}</td><td className="px-4 py-3 text-right">{money(line.purchasePrice)}</td><td className="px-4 py-3 text-right">{line.gstRate || "0"}%</td><td className="px-4 py-3">{line.hsnCode || "-"}</td><td className="px-4 py-3">{line.stock ? <span className="font-semibold text-emerald-700">Created · {line.stock.sku_code || line.stock.id}</span> : <span className="text-amber-700">Pending</span>}</td></tr>)}</tbody></table></div></section>)}</div>
    </> : null}
    {bill && showQrRequest && (
      <PurchaseBillQrRequestModal
        open
        workspaceId={workspaceId}
        organizationId={organizationId}
        bill={bill}
        onClose={closeQrRequest}
        onSubmitted={submitQrRequest}
      />
    )}
    <Modal
      open={showLocationPrompt}
      onClose={() => {
        if (!working) setShowLocationPrompt(false);
      }}
      ariaLabelledBy="purchase-stock-location-title"
      size="square"
      closeOnBackdrop={!working}
    >
      <div className="space-y-6 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-brand)]">Finished Goods stock</p>
          <h2 id="purchase-stock-location-title" className="mt-1 text-xl font-bold text-[var(--erp-text)]">Choose stock location</h2>
          <p className="mt-2 text-sm text-[var(--erp-muted)]">Select the active location where this purchase bill’s stock will be received.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select
              id="purchase-stock-location"
              label="Active stock location"
              value={selectedLocationId}
              disabled={loadingLocations || working}
              onChange={(event) => {
                setSelectedLocationId(event.target.value);
                setSelectedStorageNodeId("");
                setStockLeafOptions([]);
                setStockLeafError("");
                setLoadingStockLeaves(Boolean(event.target.value));
                setLocationLookupError("");
              }}
            >
              <option value="">
                {loadingLocations ? "Loading locations..." : locations.length ? "Select location" : "No active locations"}
              </option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.label}</option>
              ))}
            </Select>
          </div>
          <Select
            label="POS issue Sub-sub-location"
            value={selectedStorageNodeId}
            disabled={!selectedLocationId || loadingStockLeaves || working}
            onChange={(event) => setSelectedStorageNodeId(event.target.value)}
            required
            options={[
              { value: "", label: loadingStockLeaves ? "Loading issue locations…" : !selectedLocationId ? "Select Location first" : stockLeafOptions.length ? "Select Sub-sub-location" : "No active Sub-sub-locations" },
              ...stockLeafOptions.map((option) => ({ value: option.id, label: option.label })),
            ]}
          />
          {stockLeafError ? (
            <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              {stockLeafError}{" "}
              <Button type="button" variant="secondary" size="sm" onClick={() => setStockLeafRetry((value) => value + 1)}>
                Retry
              </Button>
            </p>
          ) : null}
          {!loadingStockLeaves && !stockLeafError && selectedLocationId && stockLeafOptions.length === 0 ? (
            <p role="status" className="text-sm text-[var(--erp-muted)]">
              Create an active Sub-sub-location beneath this Location before receiving POS-sellable stock.
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-10 px-2"
            aria-label="Create stock location in a new tab"
            title="Create stock location in a new tab"
            disabled={working}
            onClick={() => {
              locationMasterTabOpened.current = true;
              window.open(
                `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/location/create`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        {locationLookupError ? (
          <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{locationLookupError}</p>
        ) : null}
        {!loadingLocations && !locationLookupError && locations.length === 0 ? (
          <p className="text-sm text-[var(--erp-muted)]">No active locations are available. Create a location with +, then return here to refresh the list.</p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">{error}</p>
        ) : null}
        <div className="flex justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
          <Button type="button" variant="secondary" disabled={working} onClick={() => setShowLocationPrompt(false)}>Cancel</Button>
          <Button type="button" disabled={working || loadingLocations || loadingStockLeaves || !selectedLocationId || !selectedStorageNodeId} onClick={() => void createStock()}>
            {working ? "Creating stock..." : "Approve & Create Stock"}
          </Button>
        </div>
      </div>
    </Modal>
  </Section></Page>;
}
