"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, PackageCheck, Printer, Trash2, Truck } from "lucide-react";
import { useParams } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";

type Stage = "accept" | "pick" | "pack" | "box" | "packing-list";
type StockType = "SKU" | "GENERAL" | "ALLOCATED";

type VendorNames = {
  bookingVendor: string | null;
  quotationVendor: string | null;
  salesOrderVendor: string | null;
};

type RequestLine = {
  id: string;
  stockType: StockType;
  stockId: string;
  stockBucket: "GENERAL" | "ALLOCATED";
  locationName: string | null;
  skuCode: string | null;
  styleName: string;
  orderNo: string;
  articleNo: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  requestedQuantity: string;
  pickedQuantity: string;
  shippedQuantity: string;
  status: string;
  pickedBy: string | null;
  pickedAt: string | null;
} & VendorNames;

type OutwardRequest = {
  id: string;
  requestNo: string;
  status: string;
  requestedAt: string;
  requestedBy: string | null;
  lines: RequestLine[];
};

type BoxLine = {
  id: string;
  requestLineId: string;
  requestNo: string;
  styleName: string;
  orderNo: string;
  articleNo: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  quantity: string;
} & VendorNames;

type OutwardBox = {
  id: string;
  boxNo: string;
  packedAt: string;
  packedBy: string | null;
  shipment: { id: string; packing_list_no: string; shipped_at: string; isShipped: boolean } | null;
  lines: BoxLine[];
  vendors: VendorNames;
};

type OutwardShipment = {
  id: string;
  packingListNo: string;
  shippedAt: string;
  createdAt: string;
  shippedBy: string | null;
  isShipped: boolean;
  reversed: boolean;
  vendors: VendorNames;
  boxes: Array<{ id: string; boxNo: string }>;
};

type Workflow = {
  requests: OutwardRequest[];
  boxes: OutwardBox[];
  shipments: OutwardShipment[];
};

type PrintDocument =
  | { type: "box"; box: OutwardBox }
  | { type: "shipment"; shipment: OutwardShipment };

const quantity = (value: number | string) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const emptyWorkflow: Workflow = { requests: [], boxes: [], shipments: [] };

function summarizeVendors(lines: VendorNames[]): VendorNames {
  const summary = (field: keyof VendorNames) =>
    [...new Set(lines.map((line) => line[field]?.trim()).filter((value): value is string => Boolean(value)))].join(", ") || null;
  return {
    bookingVendor: summary("bookingVendor"),
    quotationVendor: summary("quotationVendor"),
    salesOrderVendor: summary("salesOrderVendor"),
  };
}

function VendorSummary({ vendors }: { vendors: VendorNames }) {
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-3">
      <div><dt className="text-xs text-slate-500">Booking Vendor (optional)</dt><dd className="font-medium">{vendors.bookingVendor || "—"}</dd></div>
      <div><dt className="text-xs text-slate-500">Quotation Vendor</dt><dd className="font-medium">{vendors.quotationVendor || "—"}</dd></div>
      <div><dt className="text-xs text-slate-500">Sales Order Vendor</dt><dd className="font-medium">{vendors.salesOrderVendor || "—"}</dd></div>
    </dl>
  );
}

function DocumentTable({ lines }: { lines: Array<{
  styleName: string; articleNo: string; orderNo: string; brand: string | null;
  size: string | null; colour: string | null; quantity: string;
  bookingVendor: string | null; quotationVendor: string | null; salesOrderVendor: string | null;
}> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="erp-table-head">
          <tr>
            <th className="p-3">Finished Good</th>
            <th className="p-3">Article / Order</th>
            <th className="p-3">Brand</th>
            <th className="p-3">Size / Colour</th>
            <th className="p-3">Booking Vendor</th>
            <th className="p-3">Quotation Vendor</th>
            <th className="p-3">Sales Order Vendor</th>
            <th className="p-3 text-right">Quantity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--erp-border)]">
          {lines.map((line, index) => (
            <tr key={`${line.articleNo}-${line.orderNo}-${index}`}>
              <td className="p-3 font-semibold">{line.styleName || "-"}</td>
              <td className="p-3">{line.articleNo || "-"}<span className="block text-xs text-slate-500">{line.orderNo || "-"}</span></td>
              <td className="p-3">{line.brand || "-"}</td>
              <td className="p-3">{line.size || "-"} / {line.colour || "-"}</td>
              <td className="p-3">{line.bookingVendor || "-"}</td>
              <td className="p-3">{line.quotationVendor || "-"}</td>
              <td className="p-3">{line.salesOrderVendor || "-"}</td>
              <td className="p-3 text-right font-semibold">{quantity(line.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinishedGoodsStockOutwardPage() {
  const { organizationId } = useParams<{ workspaceId: string; organizationId: string }>();
  const [workflow, setWorkflow] = useState<Workflow>(emptyWorkflow);
  const [stage, setStage] = useState<Stage>("accept");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPackLines, setSelectedPackLines] = useState<Record<string, boolean>>({});
  const [selectedBoxes, setSelectedBoxes] = useState<Record<string, boolean>>({});
  const [boxNumber, setBoxNumber] = useState("");
  const [selectedBox, setSelectedBox] = useState<OutwardBox | null>(null);
  const [printDocument, setPrintDocument] = useState<PrintDocument | null>(null);

  const loadWorkflow = useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/inventory/finished-goods-outward?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load FG Stock DC.");
      setWorkflow({
        requests: Array.isArray(payload.requests) ? payload.requests : [],
        boxes: Array.isArray(payload.boxes) ? payload.boxes : [],
        shipments: Array.isArray(payload.shipments) ? payload.shipments : [],
      });
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load FG Stock DC.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadWorkflow(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkflow]);

  useEffect(() => {
    if (!printDocument) return;
    const printTimer = window.setTimeout(() => window.print(), 100);
    const clearDocument = () => setPrintDocument(null);
    window.addEventListener("afterprint", clearDocument);
    return () => {
      window.clearTimeout(printTimer);
      window.removeEventListener("afterprint", clearDocument);
    };
  }, [printDocument]);

  const packedByRequestLine = useMemo(() => {
    const totals = new Map<string, number>();
    for (const box of workflow.boxes) {
      for (const line of box.lines) {
        totals.set(line.requestLineId, (totals.get(line.requestLineId) ?? 0) + Number(line.quantity));
      }
    }
    return totals;
  }, [workflow.boxes]);

  const packableItems = useMemo(() => workflow.requests.flatMap((request) => request.lines
    .filter((line) => line.status === "PICKED" || line.status === "PACKED")
    .map((line) => ({
      request,
      line,
      remaining: Math.max(Number(line.pickedQuantity) - (packedByRequestLine.get(line.id) ?? 0), 0),
    }))
    .filter((item) => item.remaining > 0)), [packedByRequestLine, workflow.requests]);
  const pickedItems = useMemo(() => workflow.requests.flatMap((request) => request.lines
    .filter((line) => line.status === "PICKED" && Number(line.shippedQuantity) === 0 && (packedByRequestLine.get(line.id) ?? 0) === 0)
    .map((line) => ({ request, line }))), [packedByRequestLine, workflow.requests]);
  const boxesAvailableForPackingList = useMemo(() => workflow.boxes.filter((box) => !box.shipment), [workflow.boxes]);

  const counts = useMemo(() => ({
    accept: workflow.requests.filter((request) => request.status === "REQUESTED").length,
    pick: workflow.requests.reduce((total, request) => total + request.lines.filter((line) => line.status === "ACCEPTED").length, 0),
    pack: packableItems.length,
    box: workflow.boxes.length,
    packingList: workflow.shipments.filter((shipment) => !shipment.reversed).length,
  }), [packableItems.length, workflow.boxes.length, workflow.requests, workflow.shipments]);

  async function mutate(action: string, data: Record<string, unknown>, success: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/inventory/finished-goods-outward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, ...data }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to update FG Stock DC.");
      setMessage(success);
      await loadWorkflow();
      return payload;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update FG Stock DC.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createBox() {
    if (!boxNumber.trim()) {
      setError("Enter a box number before creating the box.");
      return;
    }
    const requestLineIds = packableItems.filter(({ line }) => selectedPackLines[line.id]).map(({ line }) => line.id);
    if (requestLineIds.length === 0) {
      setError("Select at least one picked finished-good item to pack.");
      return;
    }
    const result = await mutate("box", { requestLineIds, boxNo: boxNumber.trim() }, `Box ${boxNumber.trim()} created.`);
    if (result) {
      setSelectedPackLines({});
      setBoxNumber("");
      setStage("box");
    }
  }

  async function createPackingList() {
    const boxIds = boxesAvailableForPackingList.filter((box) => selectedBoxes[box.id]).map((box) => box.id);
    if (boxIds.length === 0) {
      setError("Select at least one box to create a packing list.");
      return;
    }
    const result = await mutate("packing-list", { boxIds }, "Packing list created. Stock will be posted when it is marked as shipped.");
    if (result) {
      setSelectedBoxes({});
      setStage("packing-list");
    }
  }

  async function cancelRequest(request: OutwardRequest) {
    if (!window.confirm(`Delete request ${request.requestNo}? This cancels it and releases its remaining quantities.`)) return;
    await mutate("cancel-request", { requestId: request.id }, `${request.requestNo} cancelled.`);
  }

  async function undoPick(line: RequestLine) {
    if (!window.confirm(`Undo the pick for ${line.styleName}? The item must not be packed or shipped.`)) return;
    await mutate("unpick", { requestLineId: line.id }, `${line.styleName} returned to the approved Pick stage.`);
  }

  async function reverseShipment(shipment: OutwardShipment) {
    if (!window.confirm(`Reverse packing list ${shipment.packingListNo}? This restores its shipped quantities to the original FG stock records and reopens its boxes for deletion.`)) return;
    await mutate("reverse-shipment", { shipmentId: shipment.id }, `${shipment.packingListNo} reversed; original FG stock restored.`);
  }

  async function markShipmentShipped(shipment: OutwardShipment) {
    if (!window.confirm(`Mark packing list ${shipment.packingListNo} as shipped? This posts the shipment and deducts stock from its source inventory.`)) return;
    await mutate("mark-shipped", { shipmentId: shipment.id }, `${shipment.packingListNo} marked as shipped; FG stock has been posted.`);
  }

  async function deletePackingList(shipment: OutwardShipment) {
    if (!window.confirm(`Delete draft packing list ${shipment.packingListNo}? Its boxes will be released for another packing list.`)) return;
    await mutate("delete-packing-list", { shipmentId: shipment.id }, `${shipment.packingListNo} deleted; boxes are available again.`);
  }

  async function removeBox(box: OutwardBox) {
    if (!window.confirm(`Delete unshipped box ${box.boxNo}? Its quantities will return to Pack.`)) return;
    await mutate("delete-box", { boxId: box.id }, `${box.boxNo} removed. Its quantities are available to pack again.`);
  }

  const tabs: Array<{ label: string; value: Stage }> = [
    { label: `Approve ${counts.accept}`, value: "accept" },
    { label: `Pick ${counts.pick}`, value: "pick" },
    { label: `Pack ${counts.pack}`, value: "pack" },
    { label: `Boxes ${counts.box}`, value: "box" },
    { label: `Packing List ${counts.packingList}`, value: "packing-list" },
  ];

  return (
    <>
      <div className="print:hidden">
        <Page as="div">
          <Section>
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
              <div>
                <p className="erp-eyebrow">Inventory / Outward</p>
                <h1 className="erp-page-heading mt-1">FG Stock Pick, Pack &amp; Ship</h1>
                <p className="erp-page-subheading mt-1">Approve finished-goods requests, then pick, pack, and ship. Pickers are directed to the source General or Allocated inventory; dispatch posts against that same stock record.</p>
              </div>
              <Badge>{workflow.requests.filter((request) => request.status !== "CANCELLED").length} FG requests</Badge>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                { label: "Awaiting approval", value: counts.accept },
                { label: "Items to pick", value: counts.pick },
                { label: "Items to pack", value: counts.pack },
                { label: "Packed boxes", value: workflow.boxes.length },
                { label: "Packing lists", value: counts.packingList },
              ].map((metric) => (
                <Card key={metric.label} className="space-y-1 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
                  <p className="text-2xl font-bold text-slate-950">{metric.value}</p>
                </Card>
              ))}
            </div>

            <Tabs ariaLabel="Finished goods outward stages" tabs={tabs} value={stage} onChange={setStage} compact />
            {error && <Card role="alert" className="border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] text-sm text-[var(--erp-danger)]">{error}</Card>}
            {message && <Card role="status" className="border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-sm text-[var(--erp-brand)]">{message}</Card>}

            {loading ? (
              <Card className="text-center text-sm text-slate-500">Loading FG stock and outward documents...</Card>
            ) : stage === "accept" ? (
              <div className="space-y-4" role="tabpanel" aria-label="FG requests awaiting approval">
                {workflow.requests.filter((request) => request.status === "REQUESTED").map((request) => (
                  <Card key={request.id} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-950">{request.requestNo}</h2>
                        <p className="mt-1 text-xs text-slate-500">Requested {new Date(request.requestedAt).toLocaleString("en-IN")} by {request.requestedBy || "Inventory"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void mutate("accept", { requestId: request.id }, `${request.requestNo} approved and moved to Pick.`)} disabled={saving}>
                          <Check className="h-4 w-4" /> Approve request
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => void cancelRequest(request)} disabled={saving}>
                          <Trash2 className="h-4 w-4" /> Delete request
                        </Button>
                      </div>
                    </div>
                    <VendorSummary vendors={summarizeVendors(request.lines)} />
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1500px] text-left text-sm">
                        <thead className="erp-table-head">
                          <tr>
                            <th className="p-3">Finished good</th>
                            <th className="p-3">Pick from inventory</th>
                            <th className="p-3">Article / Order</th>
                            <th className="p-3">Brand</th>
                            <th className="p-3">Size / Colour</th>
                            <th className="p-3 text-right">Request quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--erp-border)]">
                          {request.lines.map((line) => (
                            <tr key={line.id}>
                              <td className="p-3 font-semibold">{line.styleName || "-"}</td>
                              <td className="p-3 font-semibold">Pick from {line.stockBucket === "ALLOCATED" ? "Allocated Inventory" : "General Inventory"}</td>
                              <td className="p-3">{line.articleNo || "-"}<span className="block text-xs text-slate-500">{line.orderNo || "-"}</span></td>
                              <td className="p-3">{line.brand || "-"}</td>
                              <td className="p-3">{line.size || "-"} / {line.colour || "-"}</td>
                              <td className="p-3 text-right font-semibold">{quantity(line.requestedQuantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
                {workflow.requests.every((request) => request.status !== "REQUESTED") && (
                  <Card className="text-center text-sm text-slate-500">No FG stock requests are awaiting approval.</Card>
                )}
              </div>
            ) : stage === "pick" ? (
              <div className="space-y-4" role="tabpanel" aria-label="FG items ready to pick">
                {workflow.requests.map((request) => {
                  const lines = request.lines.filter((line) => line.status === "ACCEPTED");
                  if (lines.length === 0) return null;
                  return (
                    <Card key={request.id} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-base font-bold text-slate-950">{request.requestNo}</h2>
                        {request.status === "ACCEPTED" && request.lines.every((line) => line.status === "ACCEPTED") && (
                          <Button type="button" variant="destructive" onClick={() => void cancelRequest(request)} disabled={saving}>
                            <Trash2 className="h-4 w-4" /> Delete request
                          </Button>
                        )}
                      </div>
                      <VendorSummary vendors={summarizeVendors(request.lines)} />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1500px] text-left text-sm">
                          <thead className="erp-table-head"><tr><th className="p-3">Finished good</th><th className="p-3">Pick from inventory</th><th className="p-3">Article / Order</th><th className="p-3">Size / Colour</th><th className="p-3 text-right">To pick</th><th className="p-3 text-right">Action</th></tr></thead>
                          <tbody className="divide-y divide-[var(--erp-border)]">
                            {lines.map((line) => (
                              <tr key={line.id}>
                                <td className="p-3 font-semibold">{line.styleName}<span className="block text-xs font-normal text-slate-500">{line.brand || "-"}</span></td>
                                <td className="p-3 font-semibold">Pick from {line.stockBucket === "ALLOCATED" ? "Allocated Inventory" : "General Inventory"}</td>
                                <td className="p-3">{line.articleNo || "-"}<span className="block text-xs text-slate-500">{line.orderNo || "-"}</span></td>
                                <td className="p-3">{line.size || "-"} / {line.colour || "-"}</td>
                                <td className="p-3 text-right">{quantity(line.requestedQuantity)}</td>
                                <td className="p-3 text-right">
                                  <Button type="button" size="sm" onClick={() => void mutate("pick", { requestLineId: line.id }, `${line.styleName} marked picked.`)} disabled={saving}>
                                    <Check className="h-4 w-4" /> Mark picked
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  );
                })}
                {counts.pick === 0 &&                 <Card className="text-center text-sm text-slate-500">No approved FG items are waiting to be picked.</Card>}
              </div>
            ) : stage === "pack" ? (
              <div className="space-y-4" role="tabpanel" aria-label="Picked FG items ready to pack">
                <Card className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Picked items</h2>
                    <p className="mt-1 text-sm text-slate-500">Undo a pick here before packing if it was recorded incorrectly.</p>
                  </div>
                  {pickedItems.length === 0 ? (
                    <p className="text-sm text-slate-500">No unboxed picked items are available to return.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1300px] text-left text-sm">
                        <thead className="erp-table-head"><tr><th className="p-3">Request</th><th className="p-3">Finished good</th><th className="p-3">Pick from</th><th className="p-3">Booking Vendor</th><th className="p-3">Quotation Vendor</th><th className="p-3">Sales Order Vendor</th><th className="p-3 text-right">Picked</th><th className="p-3 text-right">Action</th></tr></thead>
                        <tbody className="divide-y divide-[var(--erp-border)]">
                          {pickedItems.map(({ request, line }) => (
                            <tr key={line.id}>
                              <td className="p-3">{request.requestNo}</td>
                              <td className="p-3 font-semibold">{line.styleName}<span className="block text-xs font-normal text-slate-500">{line.size || "-"} / {line.colour || "-"}</span></td>
                              <td className="p-3">Pick from {line.stockBucket === "ALLOCATED" ? "Allocated Inventory" : "General Inventory"}</td>
                              <td className="p-3">{line.bookingVendor || "—"}</td>
                              <td className="p-3">{line.quotationVendor || "—"}</td>
                              <td className="p-3">{line.salesOrderVendor || "—"}</td>
                              <td className="p-3 text-right">{quantity(line.pickedQuantity)}</td>
                              <td className="p-3 text-right">
                                <Button type="button" size="sm" variant="destructive" onClick={() => void undoPick(line)} disabled={saving}>
                                  <Trash2 className="h-4 w-4" /> Delete pick
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-950">Pack picked items into a box</h2>
                      <p className="mt-1 text-sm text-slate-500">Selecting an item packs its remaining picked quantity.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <Input
                      label="Box number"
                      value={boxNumber}
                      onChange={(event) => setBoxNumber(event.target.value)}
                      maxLength={100}
                      required
                      placeholder="Enter or scan box number"
                      className="max-w-sm"
                    />
                    <Button type="button" onClick={() => void createBox()} disabled={saving || packableItems.length === 0 || !boxNumber.trim()}>
                      <PackageCheck className="h-4 w-4" /> {saving ? "Creating..." : "Create box"}
                    </Button>
                  </div>
                  {packableItems.length === 0 ? (
                    <p className="text-sm text-slate-500">No picked finished goods are waiting to be packed.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1500px] text-left text-sm">
                        <thead className="erp-table-head"><tr><th className="p-3">Select</th><th className="p-3">Request</th><th className="p-3">Finished good</th><th className="p-3">Article / Order</th><th className="p-3">Booking Vendor</th><th className="p-3">Quotation Vendor</th><th className="p-3">Sales Order Vendor</th><th className="p-3 text-right">Quantity to box</th></tr></thead>
                        <tbody className="divide-y divide-[var(--erp-border)]">
                          {packableItems.map(({ request, line, remaining }) => (
                            <tr key={line.id}>
                              <td className="p-3"><Checkbox checked={Boolean(selectedPackLines[line.id])} onChange={(event) => setSelectedPackLines((current) => ({ ...current, [line.id]: event.target.checked }))} aria-label={`Include ${line.styleName} from ${request.requestNo} in a box`} /></td>
                              <td className="p-3">{request.requestNo}</td>
                              <td className="p-3 font-semibold">{line.styleName}<span className="block text-xs font-normal text-slate-500">{line.stockBucket} · {line.size || "-"} · {line.colour || "-"}</span></td>
                              <td className="p-3">{line.articleNo || "-"} · {line.orderNo || "-"}</td>
                              <td className="p-3">{line.bookingVendor || "—"}</td>
                              <td className="p-3">{line.quotationVendor || "—"}</td>
                              <td className="p-3">{line.salesOrderVendor || "—"}</td>
                              <td className="p-3 text-right font-semibold">{quantity(remaining)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            ) : stage === "box" ? (
              <div className="space-y-4" role="tabpanel" aria-label="Packed FG boxes">
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Select boxes for a packing list</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {Object.values(selectedBoxes).filter(Boolean).length} of {boxesAvailableForPackingList.length} available boxes selected.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => void createPackingList()}
                    disabled={saving || Object.values(selectedBoxes).every((selected) => !selected)}
                  >
                    <PackageCheck className="h-4 w-4" /> {saving ? "Creating..." : "Create packing list"}
                  </Button>
                </Card>
                {workflow.boxes.map((box) => (
                  <Card key={box.id} className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {!box.shipment && (
                        <Checkbox
                          checked={Boolean(selectedBoxes[box.id])}
                          onChange={(event) => setSelectedBoxes((current) => ({ ...current, [box.id]: event.target.checked }))}
                          aria-label={`Select box ${box.boxNo} for a packing list`}
                        />
                      )}
                      <Button type="button" variant="card" className="min-w-0 flex-1" onClick={() => setSelectedBox(box)}>
                        <span className="flex flex-wrap items-center justify-between gap-3">
                          <span>
                            <span className="block font-semibold">{box.boxNo}</span>
                            <span className="mt-1 block text-sm font-normal text-slate-500">{box.lines.length} item lines · Packed {new Date(box.packedAt).toLocaleString("en-IN")}</span>
                            {box.shipment && <span className="mt-1 block text-sm font-normal text-slate-500">Packing list {box.shipment.packing_list_no} · {box.shipment.isShipped ? "Shipped" : "Awaiting dispatch"}</span>}
                          </span>
                          <Badge>{box.shipment ? (box.shipment.isShipped ? "Shipped" : "On packing list") : "Available"}</Badge>
                        </span>
                      </Button>
                      <VendorSummary vendors={box.vendors} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={() => setPrintDocument({ type: "box", box })}>
                        <Printer className="h-4 w-4" /> Print
                      </Button>
                      {!box.shipment && (
                        <Button type="button" variant="destructive" onClick={() => void removeBox(box)} disabled={saving}>
                          <Trash2 className="h-4 w-4" /> Delete box
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
                {workflow.boxes.length === 0 && <Card className="text-center text-sm text-slate-500">No FG boxes have been created.</Card>}
              </div>
            ) : (
              <div className="space-y-6" role="tabpanel" aria-label="FG packing lists">
                <Card className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Packing list register</h2>
                    <p className="mt-1 text-sm text-slate-500">Mark a packing list as shipped only after dispatch. Posting deducts quantities from their source FG stock and retains the packing list for audit.</p>
                  </div>
                  {workflow.shipments.length === 0 ? (
                    <p className="text-sm text-slate-500">No FG packing lists have been created yet.</p>
                  ) : workflow.shipments.map((shipment) => (
                    <div key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-border)] p-4">
                      <div>
                        <h3 className="font-semibold text-slate-950">{shipment.packingListNo}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {shipment.boxes.length} boxes · {shipment.boxes.map((box) => box.boxNo).join(", ") || "No box details"}
                          {" · "}{shipment.isShipped ? `Shipped ${new Date(shipment.shippedAt).toLocaleString("en-IN")}` : `Created ${new Date(shipment.createdAt).toLocaleString("en-IN")} · Awaiting dispatch`}
                          {shipment.reversed ? " · Reversed" : ""}
                        </p>
                        <VendorSummary vendors={shipment.vendors} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!shipment.reversed && <>
                          <Button type="button" variant="secondary" onClick={() => setPrintDocument({ type: "shipment", shipment })}>
                            <Printer className="h-4 w-4" /> Print packing list
                          </Button>
                          {shipment.isShipped ? (
                            <Button type="button" variant="destructive" onClick={() => void reverseShipment(shipment)} disabled={saving}>
                              <Trash2 className="h-4 w-4" /> Reverse shipment
                            </Button>
                          ) : (
                            <>
                              <Button type="button" onClick={() => void markShipmentShipped(shipment)} disabled={saving}>
                                <Truck className="h-4 w-4" /> Mark as shipped
                              </Button>
                              <Button type="button" variant="destructive" onClick={() => void deletePackingList(shipment)} disabled={saving}>
                                <Trash2 className="h-4 w-4" /> Delete draft
                              </Button>
                            </>
                          )}
                        </>}
                        {shipment.reversed && <Badge>Reversed</Badge>}
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </Section>
        </Page>
      </div>

      <Modal
        open={selectedBox !== null}
        onClose={() => setSelectedBox(null)}
        ariaLabelledBy="finished-goods-box-detail-title"
        ariaDescribedBy="finished-goods-box-detail-description"
        size="lg"
      >
        {selectedBox && (
          <div className="space-y-4 p-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="finished-goods-box-detail-title" className="text-xl font-semibold text-slate-900">
                  Box {selectedBox.boxNo}
                </h2>
                <p id="finished-goods-box-detail-description" className="mt-1 text-sm text-slate-600">
                  Packed {new Date(selectedBox.packedAt).toLocaleString("en-IN")} · {selectedBox.lines.length} item lines
                </p>
              </div>
              <Badge>{selectedBox.shipment ? (selectedBox.shipment.isShipped ? "Shipped" : "On packing list") : "Available"}</Badge>
            </header>
            <DocumentTable lines={selectedBox.lines} />
            <footer className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setSelectedBox(null)}>Close</Button>
            </footer>
          </div>
        )}
      </Modal>

      {printDocument && (
        <div className="hidden p-8 print:block">
          {printDocument.type === "box" ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide">Finished Goods Box Contents</p>
              <h1 className="mt-2 text-2xl font-bold">{printDocument.box.boxNo}</h1>
              <p className="mt-2 text-sm">Packed {new Date(printDocument.box.packedAt).toLocaleString("en-IN")}</p>
              <div className="mt-6"><DocumentTable lines={printDocument.box.lines} /></div>
            </section>
          ) : (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide">Finished Goods Packing List / Shipment</p>
              <h1 className="mt-2 text-2xl font-bold">{printDocument.shipment.packingListNo}</h1>
              <p className="mt-2 text-sm">
                {printDocument.shipment.isShipped
                  ? `Shipped ${new Date(printDocument.shipment.shippedAt).toLocaleString("en-IN")}`
                  : `Created ${new Date(printDocument.shipment.createdAt).toLocaleString("en-IN")} · Awaiting dispatch`}
              </p>
              <h2 className="mt-6 text-lg font-bold">Boxes</h2>
              <ul className="mt-2 list-inside list-disc text-sm">
                {printDocument.shipment.boxes.map((box) => <li key={box.id}>{box.boxNo}</li>)}
              </ul>
              <h2 className="mt-6 text-lg font-bold">Packed Items</h2>
              <div className="mt-2">
                <DocumentTable lines={workflow.boxes
                  .filter((box) => printDocument.shipment.boxes.some((selected) => selected.id === box.id))
                  .flatMap((box) => box.lines)} />
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
