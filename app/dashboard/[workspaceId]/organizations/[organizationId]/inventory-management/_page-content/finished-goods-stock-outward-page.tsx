"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, PackageCheck, Printer, Trash2, Truck } from "lucide-react";
import { useParams } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";

type Stage = "request" | "accept" | "pick" | "pack" | "box" | "ship";
type StockType = "SKU" | "GENERAL" | "ALLOCATED";

type StockRecord = {
  id: string;
  stockType: StockType;
  stockBucket: "GENERAL" | "ALLOCATED";
  locationName: string | null;
  skuCode: string | null;
  styleName: string;
  orderNo: string;
  articleNo: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  currentStock: string;
  availableToRequest: string;
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
};

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
};

type OutwardBox = {
  id: string;
  boxNo: string;
  packedAt: string;
  packedBy: string | null;
  shipment: { id: string; packing_list_no: string; shipped_at: string } | null;
  lines: BoxLine[];
};

type OutwardShipment = {
  id: string;
  packingListNo: string;
  shippedAt: string;
  shippedBy: string | null;
  boxes: Array<{ id: string; boxNo: string }>;
};

type Workflow = {
  stock: StockRecord[];
  requests: OutwardRequest[];
  boxes: OutwardBox[];
  shipments: OutwardShipment[];
};

type PrintDocument =
  | { type: "box"; box: OutwardBox }
  | { type: "shipment"; shipment: OutwardShipment };

const quantity = (value: number | string) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const emptyWorkflow: Workflow = { stock: [], requests: [], boxes: [], shipments: [] };
const stockKey = (record: Pick<StockRecord, "stockType" | "id">) => `${record.stockType}:${record.id}`;

function DocumentTable({ lines }: { lines: Array<{
  styleName: string; articleNo: string; orderNo: string; brand: string | null;
  size: string | null; colour: string | null; quantity: string;
}> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="erp-table-head">
          <tr>
            <th className="p-3">Finished Good</th>
            <th className="p-3">Article / Order</th>
            <th className="p-3">Brand</th>
            <th className="p-3">Size / Colour</th>
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
  const [stage, setStage] = useState<Stage>("request");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedStock, setSelectedStock] = useState<Record<string, boolean>>({});
  const [requestQuantities, setRequestQuantities] = useState<Record<string, string>>({});
  const [selectedPackLines, setSelectedPackLines] = useState<Record<string, boolean>>({});
  const [selectedBoxes, setSelectedBoxes] = useState<Record<string, boolean>>({});
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
        stock: Array.isArray(payload.stock) ? payload.stock : [],
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
  const unshippedBoxes = useMemo(() => workflow.boxes.filter((box) => !box.shipment), [workflow.boxes]);

  const counts = useMemo(() => ({
    request: workflow.stock.filter((record) => Number(record.availableToRequest) > 0).length,
    accept: workflow.requests.filter((request) => request.status === "REQUESTED").length,
    pick: workflow.requests.reduce((total, request) => total + request.lines.filter((line) => line.status === "ACCEPTED").length, 0),
    pack: packableItems.length,
    box: unshippedBoxes.length,
    ship: workflow.shipments.length,
  }), [packableItems.length, unshippedBoxes.length, workflow.requests, workflow.shipments.length, workflow.stock]);

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

  async function createRequest() {
    const lines = workflow.stock
      .filter((record) => selectedStock[stockKey(record)])
      .map((record) => ({
        stockType: record.stockType,
        stockId: record.id,
        quantity: requestQuantities[stockKey(record)]?.trim() ?? "",
      }));
    if (lines.length === 0 || lines.some((line) => !line.quantity || Number(line.quantity) <= 0)) {
      setError("Select at least one stock record and enter a request quantity greater than zero.");
      return;
    }
    const result = await mutate("request", { lines }, "FG stock request created and reserved.");
    if (result) {
      setSelectedStock({});
      setRequestQuantities({});
      setStage("accept");
    }
  }

  async function createBox() {
    const requestLineIds = packableItems.filter(({ line }) => selectedPackLines[line.id]).map(({ line }) => line.id);
    if (requestLineIds.length === 0) {
      setError("Select at least one picked finished-good item to pack.");
      return;
    }
    const result = await mutate("box", { requestLineIds }, "FG box created. Print its contents before sealing.");
    if (result) {
      setSelectedPackLines({});
      setStage("box");
    }
  }

  async function createShipment() {
    const boxIds = unshippedBoxes.filter((box) => selectedBoxes[box.id]).map((box) => box.id);
    if (boxIds.length === 0) {
      setError("Select at least one packed box to create an FG shipment.");
      return;
    }
    const result = await mutate("ship", { boxIds }, "FG shipment and packing list created; shipped quantities were deducted from FG stock.");
    if (result) {
      setSelectedBoxes({});
      setStage("ship");
    }
  }

  async function cancelRequest(request: OutwardRequest) {
    if (!window.confirm(`Cancel request ${request.requestNo}? Its unshipped quantities will be released.`)) return;
    await mutate("cancel-request", { requestId: request.id }, `${request.requestNo} cancelled.`);
  }

  async function removeBox(box: OutwardBox) {
    if (!window.confirm(`Delete unshipped box ${box.boxNo}? Its quantities will return to Pack.`)) return;
    await mutate("delete-box", { boxId: box.id }, `${box.boxNo} removed. Its quantities are available to pack again.`);
  }

  const tabs: Array<{ label: string; value: Stage }> = [
    { label: `Request ${counts.request}`, value: "request" },
    { label: `Accept ${counts.accept}`, value: "accept" },
    { label: `Pick ${counts.pick}`, value: "pick" },
    { label: `Pack ${counts.pack}`, value: "pack" },
    { label: `Box ${counts.box}`, value: "box" },
    { label: `Ship ${counts.ship}`, value: "ship" },
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
                <p className="erp-page-subheading mt-1">Separate finished-goods requests, picking, box packing, and shipment documents. Both General and Allocated stock are supported; dispatch posts against its source stock record.</p>
              </div>
              <Badge>{workflow.requests.filter((request) => request.status !== "CANCELLED").length} FG requests</Badge>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                { label: "Stock records", value: counts.request },
                { label: "Awaiting acceptance", value: counts.accept },
                { label: "Items to pick", value: counts.pick },
                { label: "Items to pack", value: counts.pack },
                { label: "Boxes to ship", value: counts.box },
                { label: "Packing lists", value: counts.ship },
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
            ) : stage === "request" ? (
              <Card className="space-y-4" role="tabpanel" aria-label="Create finished goods outward request">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Request finished goods from stock</h2>
                    <p className="mt-1 text-sm text-slate-500">Select available General or Allocated stock records. Requested quantities are reserved until shipped or cancelled.</p>
                  </div>
                  <Button type="button" onClick={() => void createRequest()} disabled={saving || counts.request === 0}>
                    <Check className="h-4 w-4" /> {saving ? "Creating..." : "Create request"}
                  </Button>
                </div>
                {workflow.stock.length === 0 ? (
                  <p className="text-sm text-slate-500">No finished-goods stock is currently available to request.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px] text-left text-sm">
                      <thead className="erp-table-head">
                        <tr><th className="p-3">Select</th><th className="p-3">Stock type</th><th className="p-3">Finished good</th><th className="p-3">Article / Order</th><th className="p-3">Location</th><th className="p-3 text-right">Available</th><th className="p-3 text-right">Request qty</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--erp-border)]">
                        {workflow.stock.map((record) => {
                          const key = stockKey(record);
                          const available = Number(record.availableToRequest);
                          return (
                            <tr key={key}>
                              <td className="p-3">
                                <Checkbox
                                  checked={Boolean(selectedStock[key])}
                                  disabled={available <= 0}
                                  onChange={(event) => setSelectedStock((current) => ({ ...current, [key]: event.target.checked }))}
                                  aria-label={`Select ${record.styleName}, ${record.stockBucket} stock`}
                                />
                              </td>
                              <td className="p-3">{record.stockBucket}{record.stockType === "SKU" ? " · SKU" : ""}</td>
                              <td className="p-3 font-semibold">{record.styleName}<span className="block text-xs text-slate-500">{record.brand || "-"} · {record.size || "-"} · {record.colour || "-"}</span></td>
                              <td className="p-3">{record.articleNo || "-"}<span className="block text-xs text-slate-500">{record.orderNo || "-"}{record.skuCode ? ` · ${record.skuCode}` : ""}</span></td>
                              <td className="p-3">{record.locationName || "-"}</td>
                              <td className="p-3 text-right font-semibold">{quantity(record.availableToRequest)}<span className="block text-xs font-normal text-slate-500">of {quantity(record.currentStock)} in stock</span></td>
                              <td className="p-3">
                                <Input
                                  aria-label={`Request quantity for ${record.styleName}`}
                                  type="number"
                                  min="0"
                                  max={record.availableToRequest}
                                  step={record.stockType === "SKU" ? "0.01" : "1"}
                                  value={requestQuantities[key] ?? ""}
                                  disabled={available <= 0}
                                  onChange={(event) => setRequestQuantities((current) => ({ ...current, [key]: event.target.value }))}
                                  className="max-w-32"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : stage === "accept" ? (
              <div className="space-y-4" role="tabpanel" aria-label="FG requests awaiting acceptance">
                {workflow.requests.filter((request) => request.status === "REQUESTED").map((request) => (
                  <Card key={request.id} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-950">{request.requestNo}</h2>
                        <p className="mt-1 text-xs text-slate-500">Requested {new Date(request.requestedAt).toLocaleString("en-IN")} by {request.requestedBy || "Inventory"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void mutate("accept", { requestId: request.id }, `${request.requestNo} accepted and moved to Pick.`)} disabled={saving}>
                          <Check className="h-4 w-4" /> Accept request
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => void cancelRequest(request)} disabled={saving}>
                          <Trash2 className="h-4 w-4" /> Cancel request
                        </Button>
                      </div>
                    </div>
                    <DocumentTable lines={request.lines.map((line) => ({
                      styleName: line.styleName, articleNo: line.articleNo, orderNo: line.orderNo,
                      brand: line.brand, size: line.size, colour: line.colour, quantity: line.requestedQuantity,
                    }))} />
                  </Card>
                ))}
                {workflow.requests.every((request) => request.status !== "REQUESTED") && (
                  <Card className="text-center text-sm text-slate-500">No FG stock requests are awaiting acceptance.</Card>
                )}
              </div>
            ) : stage === "pick" ? (
              <div className="space-y-4" role="tabpanel" aria-label="FG items ready to pick">
                {workflow.requests.map((request) => {
                  const lines = request.lines.filter((line) => line.status === "ACCEPTED");
                  if (lines.length === 0) return null;
                  return (
                    <Card key={request.id} className="space-y-4">
                      <h2 className="text-base font-bold text-slate-950">{request.requestNo}</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[850px] text-left text-sm">
                          <thead className="erp-table-head"><tr><th className="p-3">Finished good</th><th className="p-3">Stock / Article</th><th className="p-3">Size / Colour</th><th className="p-3 text-right">To pick</th><th className="p-3 text-right">Action</th></tr></thead>
                          <tbody className="divide-y divide-[var(--erp-border)]">
                            {lines.map((line) => (
                              <tr key={line.id}>
                                <td className="p-3 font-semibold">{line.styleName}<span className="block text-xs font-normal text-slate-500">{line.brand || "-"}</span></td>
                                <td className="p-3">{line.stockBucket}<span className="block text-xs text-slate-500">{line.articleNo || "-"} · {line.orderNo || "-"}</span></td>
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
                {counts.pick === 0 && <Card className="text-center text-sm text-slate-500">No accepted FG items are waiting to be picked.</Card>}
              </div>
            ) : stage === "pack" ? (
              <Card className="space-y-4" role="tabpanel" aria-label="Picked FG items ready to pack">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Pack picked items into a box</h2>
                    <p className="mt-1 text-sm text-slate-500">Selecting an item packs its remaining picked quantity.</p>
                  </div>
                  <Button type="button" onClick={() => void createBox()} disabled={saving || packableItems.length === 0}>
                    <PackageCheck className="h-4 w-4" /> {saving ? "Creating..." : "Create box"}
                  </Button>
                </div>
                {packableItems.length === 0 ? (
                  <p className="text-sm text-slate-500">No picked finished goods are waiting to be packed.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead className="erp-table-head"><tr><th className="p-3">Select</th><th className="p-3">Request</th><th className="p-3">Finished good</th><th className="p-3">Article / Order</th><th className="p-3 text-right">Quantity to box</th></tr></thead>
                      <tbody className="divide-y divide-[var(--erp-border)]">
                        {packableItems.map(({ request, line, remaining }) => (
                          <tr key={line.id}>
                            <td className="p-3"><Checkbox checked={Boolean(selectedPackLines[line.id])} onChange={(event) => setSelectedPackLines((current) => ({ ...current, [line.id]: event.target.checked }))} aria-label={`Include ${line.styleName} from ${request.requestNo} in a box`} /></td>
                            <td className="p-3">{request.requestNo}</td>
                            <td className="p-3 font-semibold">{line.styleName}<span className="block text-xs font-normal text-slate-500">{line.stockBucket} · {line.size || "-"} · {line.colour || "-"}</span></td>
                            <td className="p-3">{line.articleNo || "-"} · {line.orderNo || "-"}</td>
                            <td className="p-3 text-right font-semibold">{quantity(remaining)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : stage === "box" ? (
              <div className="space-y-4" role="tabpanel" aria-label="Packed FG boxes">
                {workflow.boxes.map((box) => (
                  <Card key={box.id} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-950">{box.boxNo}</h2>
                        <p className="mt-1 text-sm text-slate-500">Packed {new Date(box.packedAt).toLocaleString("en-IN")} · {box.shipment ? `Packing list ${box.shipment.packing_list_no}` : "Awaiting shipment"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" onClick={() => setPrintDocument({ type: "box", box })}>
                          <Printer className="h-4 w-4" /> Print box contents
                        </Button>
                        {!box.shipment && (
                          <Button type="button" variant="destructive" onClick={() => void removeBox(box)} disabled={saving}>
                            <Trash2 className="h-4 w-4" /> Delete box
                          </Button>
                        )}
                      </div>
                    </div>
                    <DocumentTable lines={box.lines} />
                  </Card>
                ))}
                {workflow.boxes.length === 0 && <Card className="text-center text-sm text-slate-500">No FG boxes have been created.</Card>}
              </div>
            ) : (
              <div className="space-y-6" role="tabpanel" aria-label="FG shipments and packing lists">
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-950">Create FG shipment / packing list</h2>
                      <p className="mt-1 text-sm text-slate-500">Select packed boxes. Shipping deducts their quantities from the linked FG stock records.</p>
                    </div>
                    <Button type="button" onClick={() => void createShipment()} disabled={saving || unshippedBoxes.length === 0}>
                      <Truck className="h-4 w-4" /> {saving ? "Creating..." : "Ship selected boxes"}
                    </Button>
                  </div>
                  {unshippedBoxes.length === 0 ? (
                    <p className="text-sm text-slate-500">There are no unshipped FG boxes.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="erp-table-head"><tr><th className="p-3">Select</th><th className="p-3">Box number</th><th className="p-3">Items</th><th className="p-3">Packed at</th></tr></thead>
                        <tbody className="divide-y divide-[var(--erp-border)]">
                          {unshippedBoxes.map((box) => (
                            <tr key={box.id}>
                              <td className="p-3"><Checkbox checked={Boolean(selectedBoxes[box.id])} onChange={(event) => setSelectedBoxes((current) => ({ ...current, [box.id]: event.target.checked }))} aria-label={`Include box ${box.boxNo} in shipment`} /></td>
                              <td className="p-3 font-semibold">{box.boxNo}</td>
                              <td className="p-3">{box.lines.length}</td>
                              <td className="p-3">{new Date(box.packedAt).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                <Card className="space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">FG packing list history</h2>
                    <p className="mt-1 text-sm text-slate-500">Shipped packing lists are retained with their box links; posted shipments are not deletable.</p>
                  </div>
                  {workflow.shipments.length === 0 ? (
                    <p className="text-sm text-slate-500">No FG packing lists have been created yet.</p>
                  ) : workflow.shipments.map((shipment) => (
                    <div key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-border)] p-4">
                      <div>
                        <h3 className="font-semibold text-slate-950">{shipment.packingListNo}</h3>
                        <p className="mt-1 text-sm text-slate-500">{shipment.boxes.length} boxes · Shipped {new Date(shipment.shippedAt).toLocaleString("en-IN")}</p>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => setPrintDocument({ type: "shipment", shipment })}>
                        <Printer className="h-4 w-4" /> Print packing list
                      </Button>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </Section>
        </Page>
      </div>

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
              <p className="mt-2 text-sm">Shipped {new Date(printDocument.shipment.shippedAt).toLocaleString("en-IN")}</p>
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
