"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, PackageCheck, Printer, Trash2, Truck } from "lucide-react";
import { useParams } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";

type Stage = "accept" | "pick" | "pack" | "box" | "ship";

type OutwardLine = {
  id: string;
  workOrderBomLineId: string;
  rawMaterial: string | null;
  category: string | null;
  size: string | null;
  allocatedQuantity: string;
  requestedQuantity: string;
  pickedQuantity: string;
  status: string;
  pickedBy: string | null;
  pickedAt: string | null;
};

type OutwardRequest = {
  id: string;
  workOrderId: string;
  requestNo: string;
  status: string;
  requestedAt: string;
  requestedBy: string | null;
  workOrderNo: string;
  orderNo: string;
  lines: OutwardLine[];
};

type BoxLine = {
  id: string;
  requestLineId: string;
  rawMaterial: string | null;
  category: string | null;
  size: string | null;
  requestNo: string;
  workOrderNo: string;
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
  requests: OutwardRequest[];
  boxes: OutwardBox[];
  shipments: OutwardShipment[];
};

type PrintDocument =
  | { type: "box"; box: OutwardBox }
  | { type: "shipment"; shipment: OutwardShipment };

const quantity = (value: number | string) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const emptyWorkflow: Workflow = { requests: [], boxes: [], shipments: [] };

function outwardError(error: unknown) {
  return error instanceof Error ? error.message : "Unable to update raw-material outward.";
}

function DocumentTable({ lines }: { lines: Array<{ rawMaterial: string | null; category: string | null; size: string | null; quantity: string; requestNo?: string; workOrderNo?: string; boxNo?: string }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="erp-table-head">
          <tr>
            <th className="p-3">Raw Material</th>
            <th className="p-3">Category</th>
            <th className="p-3">Size</th>
            {lines.some((line) => line.boxNo) && <th className="p-3">Box No.</th>}
            {lines.some((line) => line.workOrderNo) && <th className="p-3">Work Order</th>}
            {lines.some((line) => line.requestNo) && <th className="p-3">Request</th>}
            <th className="p-3 text-right">Quantity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--erp-border)]">
          {lines.map((line, index) => (
            <tr key={`${line.requestNo ?? ""}-${line.workOrderNo ?? ""}-${index}`}>
              <td className="p-3 font-semibold">{line.rawMaterial || "-"}</td>
              <td className="p-3">{line.category || "-"}</td>
              <td className="p-3">{line.size || "-"}</td>
              {lines.some((item) => item.boxNo) && <td className="p-3">{line.boxNo || "-"}</td>}
              {lines.some((item) => item.workOrderNo) && <td className="p-3">{line.workOrderNo || "-"}</td>}
              {lines.some((item) => item.requestNo) && <td className="p-3">{line.requestNo || "-"}</td>}
              <td className="p-3 text-right font-semibold">{quantity(line.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RawMaterialOutwardPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const organizationId = params?.organizationId ?? "";
  const [workflow, setWorkflow] = useState<Workflow>(emptyWorkflow);
  const [stage, setStage] = useState<Stage>("accept");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPackLines, setSelectedPackLines] = useState<Record<string, boolean>>({});
  const [selectedBoxes, setSelectedBoxes] = useState<Record<string, boolean>>({});
  const [printDocument, setPrintDocument] = useState<PrintDocument | null>(null);

  const loadWorkflow = useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await fetch(
        `/api/inventory/raw-material-outward?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load raw-material outward.");
      setWorkflow({
        requests: Array.isArray(payload.requests) ? payload.requests : [],
        boxes: Array.isArray(payload.boxes) ? payload.boxes : [],
        shipments: Array.isArray(payload.shipments) ? payload.shipments : [],
      });
    } catch (loadError) {
      setError(outwardError(loadError));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadWorkflow(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkflow]);

  useEffect(() => {
    if (!printDocument || typeof window === "undefined") return;
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
  const unshippedBoxes = useMemo(
    () => workflow.boxes.filter((box) => !box.shipment),
    [workflow.boxes],
  );

  const counts = useMemo(() => ({
    accept: workflow.requests.filter((request) => request.status === "REQUESTED").length,
    pick: workflow.requests.reduce((total, request) => total + request.lines.filter((line) => line.status === "ACCEPTED").length, 0),
    pack: packableItems.length,
    box: unshippedBoxes.length,
    ship: workflow.shipments.length,
  }), [packableItems.length, unshippedBoxes.length, workflow.requests, workflow.shipments.length]);

  async function mutate(action: string, data: Record<string, unknown>, success: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/inventory/raw-material-outward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action, ...data }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to update raw-material outward.");
      setMessage(success);
      await loadWorkflow();
      return payload;
    } catch (saveError) {
      setError(outwardError(saveError));
      return null;
    } finally {
      setSaving(false);
    }
  }

  function setLineSelected(id: string, checked: boolean) {
    setSelectedPackLines((current) => ({ ...current, [id]: checked }));
  }

  async function createBox() {
    const requestLineIds = packableItems
      .filter(({ line }) => selectedPackLines[line.id])
      .map(({ line }) => line.id);
    if (requestLineIds.length === 0) {
      setError("Select at least one picked material item to pack.");
      return;
    }
    const payload = await mutate("box", { requestLineIds }, "Box created. Print the box contents sheet before sealing.");
    if (payload) {
      setSelectedPackLines({});
      setStage("box");
    }
  }

  async function createShipment() {
    const boxIds = unshippedBoxes.filter((box) => selectedBoxes[box.id]).map((box) => box.id);
    if (boxIds.length === 0) {
      setError("Select at least one packed box to create a shipment.");
      return;
    }
    const payload = await mutate("ship", { boxIds }, "Shipment and packing list created.");
    if (payload) {
      setSelectedBoxes({});
      setStage("ship");
    }
  }

  async function deleteShipment(shipment: OutwardShipment) {
    if (!window.confirm(`Delete packing list ${shipment.packingListNo}? Its boxes will return to the unshipped queue.`)) return;
    await mutate(
      "delete-shipment",
      { shipmentId: shipment.id },
      `Packing list ${shipment.packingListNo} deleted. Its boxes are available to ship again.`,
    );
  }

  async function cancelRequest(request: OutwardRequest) {
    if (!window.confirm(`Delete request ${request.requestNo}? It will be cancelled and its quantities released for a new request.`)) return;
    await mutate("cancel-request", { requestId: request.id }, `${request.requestNo} cancelled.`);
  }

  async function undoAcceptance(request: OutwardRequest) {
    if (!window.confirm(`Return ${request.requestNo} to Accept?`)) return;
    await mutate("undo-accept", { requestId: request.id }, `${request.requestNo} returned to Accept.`);
  }

  async function undoPick(line: OutwardLine) {
    if (!window.confirm(`Undo the pick for ${line.rawMaterial || "this material"}?`)) return;
    await mutate("undo-pick", { requestLineId: line.id }, `${line.rawMaterial || "Material"} returned to the pick queue.`);
  }

  async function removeFromPack(line: OutwardLine) {
    if (!window.confirm(`Delete ${line.rawMaterial || "this material"} from Pack and return it to Pick?`)) return;
    await mutate("undo-pick", { requestLineId: line.id }, `${line.rawMaterial || "Material"} removed from Pack and returned to Pick.`);
  }

  async function removeBox(box: OutwardBox) {
    if (!window.confirm(`Delete box ${box.boxNo}? Its quantities will return to Pack.`)) return;
    await mutate("delete-box", { boxId: box.id }, `${box.boxNo} removed. Its quantities are available to pack again.`);
  }

  const tabs: Array<{ label: string; value: Stage }> = [
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
                <h1 className="erp-page-heading mt-1">Raw Material Pick, Pack &amp; Ship</h1>
                <p className="erp-page-subheading mt-1">One queue for allocated work-order material requests, picking, box packing, and shipment documents. Store Verification remains the stock-posting step.</p>
              </div>
              <Badge>{workflow.requests.filter((request) => request.status !== "CANCELLED").length} material requests</Badge>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
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

            <Tabs ariaLabel="Raw material outward stages" tabs={tabs} value={stage} onChange={setStage} compact />

            {error && <Card role="alert" className="border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] text-sm text-[var(--erp-danger)]">{error}</Card>}
            {message && <Card role="status" className="border-[var(--erp-brand)] bg-[var(--erp-brand-soft)] text-sm text-[var(--erp-brand)]">{message}</Card>}

            {loading ? (
              <Card className="text-center text-sm text-slate-500">Loading outward requests and documents...</Card>
            ) : stage === "accept" ? (
              <div className="space-y-4" role="tabpanel" aria-label="Requests awaiting acceptance">
                {workflow.requests.filter((request) => request.status === "REQUESTED").map((request) => (
                  <Card key={request.id} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-950">{request.requestNo}</h2>
                        <p className="mt-1 text-sm text-slate-500">Work Order {request.workOrderNo} · Order {request.orderNo}</p>
                        <p className="mt-1 text-xs text-slate-500">Requested {new Date(request.requestedAt).toLocaleString("en-IN")} by {request.requestedBy || "Work Order"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void mutate("accept", { requestId: request.id }, `${request.requestNo} accepted and moved to Pick.`)} disabled={saving}>
                          <Check className="h-4 w-4" /> Accept request
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => void cancelRequest(request)} disabled={saving}>
                          <Trash2 className="h-4 w-4" /> Delete request
                        </Button>
                      </div>
                    </div>
                    <DocumentTable lines={request.lines.map((line) => ({
                      rawMaterial: line.rawMaterial,
                      category: line.category,
                      size: line.size,
                      quantity: line.requestedQuantity,
                    }))} />
                  </Card>
                ))}
                {workflow.requests.every((request) => request.status !== "REQUESTED") && (
                  <Card className="text-center text-sm text-slate-500">No material requests are awaiting acceptance.</Card>
                )}
              </div>
            ) : stage === "pick" ? (
              <div className="space-y-4" role="tabpanel" aria-label="Items ready to pick">
                {workflow.requests.map((request) => {
                  const lines = request.lines.filter((line) => line.status === "ACCEPTED" || line.status === "PICKED");
                  if (lines.length === 0) return null;
                  return (
                    <Card key={request.id} className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-bold text-slate-950">{request.requestNo}</h2>
                          <p className="mt-1 text-sm text-slate-500">Work Order {request.workOrderNo} · Order {request.orderNo}</p>
                        </div>
                        {request.status === "ACCEPTED" && request.lines.every((line) => line.status === "ACCEPTED") && (
                          <Button type="button" variant="destructive" onClick={() => void undoAcceptance(request)} disabled={saving}>
                            <Trash2 className="h-4 w-4" /> Undo acceptance
                          </Button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead className="erp-table-head"><tr><th className="p-3">Raw Material</th><th className="p-3">Category / Size</th><th className="p-3 text-right">To Pick</th><th className="p-3 text-right">Action</th></tr></thead>
                          <tbody className="divide-y divide-[var(--erp-border)]">
                            {lines.map((line) => (
                              <tr key={line.id}>
                                <td className="p-3 font-semibold">{line.rawMaterial || "-"}</td>
                                <td className="p-3">{line.category || "-"} / {line.size || "-"}</td>
                                <td className="p-3 text-right">{quantity(line.requestedQuantity)}</td>
                                <td className="p-3 text-right">
                                  {line.status === "PICKED" ? (
                                    <Button type="button" size="sm" variant="destructive" onClick={() => void undoPick(line)} disabled={saving}>
                                      <Trash2 className="h-4 w-4" /> Undo pick
                                    </Button>
                                  ) : (
                                    <Button type="button" size="sm" onClick={() => void mutate("pick", { requestLineId: line.id }, `${line.rawMaterial || "Material"} marked picked.`)} disabled={saving}>
                                      <Check className="h-4 w-4" /> Mark picked
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  );
                })}
                {workflow.requests.every((request) => request.lines.every((line) => line.status !== "ACCEPTED" && line.status !== "PICKED")) && (
                  <Card className="text-center text-sm text-slate-500">No accepted or picked items are waiting here.</Card>
                )}
              </div>
            ) : stage === "pack" ? (
              <Card className="space-y-4" role="tabpanel" aria-label="Picked items ready to pack">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">Pack picked items into a box</h2>
                    <p className="mt-1 text-sm text-slate-500">Select picked items; the full picked quantity for each selected item will be boxed.</p>
                  </div>
                  <Button type="button" onClick={() => void createBox()} disabled={saving || packableItems.length === 0}>
                    <PackageCheck className="h-4 w-4" /> {saving ? "Creating..." : "Create box"}
                  </Button>
                </div>
                {packableItems.length === 0 ? (
                  <p className="text-sm text-slate-500">No picked quantities are waiting to be packed.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="erp-table-head"><tr><th className="p-3">Select</th><th className="p-3">Request / Work Order</th><th className="p-3">Raw Material</th><th className="p-3">Category / Size</th><th className="p-3 text-right">Quantity to Box</th><th className="p-3 text-right">Action</th></tr></thead>
                      <tbody className="divide-y divide-[var(--erp-border)]">
                        {packableItems.map(({ request, line, remaining }) => (
                          <tr key={line.id}>
                            <td className="p-3">
                              <Checkbox
                                checked={Boolean(selectedPackLines[line.id])}
                                onChange={(event) => setLineSelected(line.id, event.target.checked)}
                                aria-label={`Include ${line.rawMaterial || "material"} from request ${request.requestNo} in a box`}
                              />
                            </td>
                            <td className="p-3">{request.requestNo}<span className="block text-xs text-slate-500">{request.workOrderNo}</span></td>
                            <td className="p-3 font-semibold">{line.rawMaterial || "-"}</td>
                            <td className="p-3">{line.category || "-"} / {line.size || "-"}</td>
                            <td className="p-3 text-right font-semibold">{quantity(remaining)}</td>
                            <td className="p-3 text-right">
                              {line.status === "PICKED" && !packedByRequestLine.has(line.id) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => void removeFromPack(line)}
                                  disabled={saving}
                                >
                                  <Trash2 className="h-4 w-4" /> Delete from Pack
                                </Button>
                              ) : (
                                <span className="text-xs text-slate-500">Remove box first</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ) : stage === "box" ? (
              <div className="space-y-4" role="tabpanel" aria-label="Packed boxes">
                {unshippedBoxes.map((box) => (
                  <Card key={box.id} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-950">{box.boxNo}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Packed {new Date(box.packedAt).toLocaleString("en-IN")} · {box.shipment ? `Packing list ${box.shipment.packing_list_no}` : "Awaiting shipment"}
                        </p>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => setPrintDocument({ type: "box", box })}>
                        <Printer className="h-4 w-4" /> Print box contents
                      </Button>
                      <Button type="button" variant="destructive" onClick={() => void removeBox(box)} disabled={saving}>
                        <Trash2 className="h-4 w-4" /> Delete box
                      </Button>
                    </div>
                    <DocumentTable lines={box.lines} />
                  </Card>
                ))}
                {unshippedBoxes.length === 0 && <Card className="text-center text-sm text-slate-500">No unshipped boxes are waiting here.</Card>}
              </div>
            ) : (
              <div className="space-y-6" role="tabpanel" aria-label="Shipments and packing lists">
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-950">Create shipment / packing list</h2>
                      <p className="mt-1 text-sm text-slate-500">Select one or more packed boxes. The generated packing-list number is the unique shipment number.</p>
                    </div>
                    <Button type="button" onClick={() => void createShipment()} disabled={saving || unshippedBoxes.length === 0}>
                      <Truck className="h-4 w-4" /> {saving ? "Creating..." : "Ship selected boxes"}
                    </Button>
                  </div>
                  {unshippedBoxes.length === 0 ? (
                    <p className="text-sm text-slate-500">There are no unshipped boxes.</p>
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
                    <h2 className="text-base font-bold text-slate-950">Packing list history</h2>
                    <p className="mt-1 text-sm text-slate-500">Each shipment is saved as a packing list with the box contents and unique number.</p>
                  </div>
                  {workflow.shipments.length === 0 ? (
                    <p className="text-sm text-slate-500">No packing lists have been created yet.</p>
                  ) : workflow.shipments.map((shipment) => (
                    <div key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-border)] p-4">
                      <div>
                        <h3 className="font-semibold text-slate-950">{shipment.packingListNo}</h3>
                        <p className="mt-1 text-sm text-slate-500">{shipment.boxes.length} boxes · Shipped {new Date(shipment.shippedAt).toLocaleString("en-IN")}</p>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => setPrintDocument({ type: "shipment", shipment })}>
                        <Printer className="h-4 w-4" /> Print packing list
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void deleteShipment(shipment)}
                        disabled={saving}
                        aria-label={`Delete packing list ${shipment.packingListNo}`}
                      >
                        <Trash2 className="h-4 w-4" /> Delete packing list
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
              <p className="text-xs font-semibold uppercase tracking-wide">Raw Material Box Contents</p>
              <h1 className="mt-2 text-2xl font-bold">{printDocument.box.boxNo}</h1>
              <p className="mt-2 text-sm">Packed {new Date(printDocument.box.packedAt).toLocaleString("en-IN")}</p>
              <div className="mt-6"><DocumentTable lines={printDocument.box.lines} /></div>
            </section>
          ) : (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide">Raw Material Packing List / Shipment</p>
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
                  .flatMap((box) => box.lines.map((line) => ({ ...line, boxNo: box.boxNo })))} />
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
