"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import Textarea from "@/components/ui/Textarea";

type WipOperation = {
  id: string;
  operation: string;
  budgetedPrice: number;
  actualPrice: number | null;
  completedQty: number;
  qualityStatus: string | null;
  remarks: string | null;
};

type WipRecord = {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  orderNo: string;
  styleName: string | null;
  brand: string | null;
  buyer: string | null;
  orderQty: number;
  completedQty: number;
  pendingQty: number;
  processName: string;
  processStatus: string;
  operations: WipOperation[];
  sizeLines?: Array<{ sourceFinishedGoodsId: string; size: string | null; buyerSize: string | null; quantity: number }>;
  processId?: string;
  nextProcessId?: string | null;
  receivedQty?: number;
  bundleTransferredQty?: number;
  bundleAcceptedQty?: number;
  bundleYetToTransferQty?: number;
  flowInQty?: number;
  flowWipQty?: number;
  flowOutIssuedQty?: number;
  flowOutAcceptedQty?: number;
  incomingTransfers?: Array<{ id: string; issuedQty: number; acceptedQty: number; pendingQty: number; status: string; fromProcessName: string; sizeLines: Array<{ source_finished_goods_id?: string | null; size: string | null; buyer_size?: string | null; issued_qty: number; accepted_qty: number }> }>;
  outgoingTransfers?: Array<{ id: string; issuedQty: number; acceptedQty: number; pendingQty: number; status: string; toProcessId: string; toProcessName: string }>;
};

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");
const price = (value: number | null) => value === null ? "-" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FactoryProductionWipDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; processRecordId: string }>();
  const organizationId = params?.organizationId ?? "demo-org";
  const processRecordId = params?.processRecordId ?? "";
  const [records, setRecords] = useState<WipRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState("");
  const [updateRecord, setUpdateRecord] = useState<WipRecord | null>(null);
  const [updateLevel, setUpdateLevel] = useState<"PROCESS" | "OPERATION">("PROCESS");
  const [operationId, setOperationId] = useState("");
  const [completedQty, setCompletedQty] = useState("");
  const [vendorBillable, setVendorBillable] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, string>>({});
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [transferRecord, setTransferRecord] = useState<WipRecord | null>(null);
  const [transferQty, setTransferQty] = useState("");
  const [transferSizeQuantities, setTransferSizeQuantities] = useState<Record<string, string>>({});
  const [transferMessage, setTransferMessage] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [acceptTransfer, setAcceptTransfer] = useState<{ id: string; sizeLines: Array<{ source_finished_goods_id?: string | null; size: string | null; buyer_size?: string | null; issued_qty: number; accepted_qty: number }>; operations: WipOperation[] } | null>(null);
  const [acceptedSizeQuantities, setAcceptedSizeQuantities] = useState<Record<string, string>>({});
  const [grnOperationQuantities, setGrnOperationQuantities] = useState<Record<string, string>>({});
  const [grnOperationBillable, setGrnOperationBillable] = useState<Record<string, boolean>>({});
  const [savingAccept, setSavingAccept] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refreshRecords() {
    const query = new URLSearchParams({ organizationId, limit: "100", process: processRecordId });
    const response = await fetch(`/api/factory/production/wip?${query.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to refresh process details.");
    setRecords(Array.isArray(data.workInProgress) ? data.workInProgress : []);
    setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
  }

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ organizationId, limit: "100", process: processRecordId });
    void fetch(`/api/factory/production/wip?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load process details.");
        return data;
      })
      .then((data) => {
        const match = Array.isArray(data.workInProgress) ? data.workInProgress : [];
        if (active) {
          if (match.length > 0) setRecords(match);
          else setError("The work-order process could not be found.");
          setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load process details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [organizationId, processRecordId]);

  async function loadMoreRecords() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setPaginationError("");
    try {
      const query = new URLSearchParams({ organizationId, limit: "100", process: processRecordId, cursor: nextCursor });
      const response = await fetch(`/api/factory/production/wip?${query.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load more work orders.");
      setRecords((current) => [...current, ...(Array.isArray(data.workInProgress) ? data.workInProgress : [])]);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (loadError) {
      setPaginationError(loadError instanceof Error ? loadError.message : "Unable to load more work orders.");
    } finally {
      setLoadingMore(false);
    }
  }

  const openUpdate = (record: WipRecord) => {
    setUpdateRecord(record);
    setUpdateLevel("PROCESS");
    setOperationId("");
    setCompletedQty("");
    setVendorBillable(false);
    setVendorName("");
    setEmployeeName("");
    setRemarks("");
    setSizeQuantities(Object.fromEntries((record.sizeLines ?? []).map((line, index) => [`${line.size ?? line.buyerSize ?? "size"}-${index}`, ""])));
  };

  async function saveProductionUpdate() {
    if (!updateRecord) return;
    setSavingUpdate(true);
    setUpdateMessage("");
    try {
      const lines = (updateRecord.sizeLines ?? []).map((line, index) => ({
        sourceFinishedGoodsId: line.sourceFinishedGoodsId,
        size: line.size,
        buyerSize: line.buyerSize,
        quantity: Number(sizeQuantities[`${line.size ?? line.buyerSize ?? "size"}-${index}`] || 0),
      })).filter((line) => line.quantity > 0);
      const response = await fetch("/api/factory/production/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, workOrderId: updateRecord.workOrderId, processName: updateRecord.processName, updateLevel, operationId, completedQty: Number(completedQty || 0), vendorBillable, vendorName, employeeName, remarks, sizeLines: lines }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save production update.");
      setUpdateRecord(null);
      setUpdateMessage("Production update saved successfully.");
      try {
        await refreshRecords();
      } catch {
        setPaginationError("Production update saved, but balances could not be refreshed. Reload this page to see the latest quantities.");
      }
    } catch (saveError) {
      setUpdateMessage(saveError instanceof Error ? saveError.message : "Unable to save production update.");
    } finally {
      setSavingUpdate(false);
    }
  }

  const openTransfer = (record: WipRecord) => {
    setTransferRecord(record);
    setTransferQty("");
    setTransferMessage("");
    setTransferSizeQuantities(Object.fromEntries((record.sizeLines ?? []).map((line, index) => [`${line.size ?? line.buyerSize ?? "size"}-${index}`, ""])));
  };

  async function saveBundleTransfer() {
    if (!transferRecord || !transferRecord.processId || !transferRecord.nextProcessId) return;
    setSavingTransfer(true);
    setTransferMessage("");
    try {
      const sizeLines = (transferRecord.sizeLines ?? []).map((line, index) => ({ sourceFinishedGoodsId: line.sourceFinishedGoodsId, size: line.size, buyerSize: line.buyerSize, quantity: Number(transferSizeQuantities[`${line.size ?? line.buyerSize ?? "size"}-${index}`] || 0) })).filter((line) => line.quantity > 0);
      const response = await fetch("/api/factory/production/bundle-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "ISSUE", workOrderId: transferRecord.workOrderId, fromProcessId: transferRecord.processId, toProcessId: transferRecord.nextProcessId, completedQty: Number(transferQty || 0), sizeLines }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to issue bundle transfer.");
      setTransferRecord(null);
      setTransferMessage("Bundle transfer issued to the next process.");
      try {
        await refreshRecords();
      } catch {
        setPaginationError("Bundle transfer saved, but balances could not be refreshed. Reload this page to see the latest quantities.");
      }
    } catch (transferError) {
      setTransferMessage(transferError instanceof Error ? transferError.message : "Unable to issue bundle transfer.");
    } finally {
      setSavingTransfer(false);
    }
  }

  async function acceptBundleTransfer() {
    if (!acceptTransfer || savingAccept) return;
    setSavingAccept(true);
    setTransferMessage("");
    try {
      const sizeLines = acceptTransfer.sizeLines.map((line, index) => ({ sourceFinishedGoodsId: line.source_finished_goods_id, size: line.size, buyerSize: line.buyer_size, quantity: Number(acceptedSizeQuantities[`${line.size ?? line.buyer_size ?? "size"}-${index}`] || 0) })).filter((line) => line.quantity > 0);
      const operationLines = acceptTransfer.operations.map((operation) => ({ operationId: operation.id, operationName: operation.operation, actualMadeQty: Number(grnOperationQuantities[operation.id] || 0), billable: Boolean(grnOperationBillable[operation.id]) })).filter((line) => line.actualMadeQty > 0);
      const response = await fetch("/api/factory/production/bundle-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "ACCEPT", transferId: acceptTransfer.id, sizeLines, operationLines }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to accept bundle transfer.");
      setTransferMessage("GRN saved and bundle received.");
      setAcceptTransfer(null);
      try {
        await refreshRecords();
      } catch {
        setPaginationError("GRN saved, but balances could not be refreshed. Reload this page to see the latest quantities.");
      }
    } catch (acceptError) {
      setTransferMessage(acceptError instanceof Error ? acceptError.message : "Unable to accept bundle transfer.");
    } finally {
      setSavingAccept(false);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        {loading && <Card className="p-6 text-sm text-slate-600">Loading process details...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>}
        {!loading && !error && records.length > 0 && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Work Order Process</p>
                <h1 className="mt-2 text-3xl font-bold text-slate-900">{records[0].processName}</h1>
                <p className="mt-2 text-sm text-slate-600">{records.length} work orders assigned to this process</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase text-emerald-700">Process Group</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {records.map((record) => (
                <Card key={record.id} className="border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Work Order</p><h2 className="mt-1 text-lg font-bold text-slate-900">{record.workOrderNo}</h2></div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">{record.processStatus}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div><dt className="text-slate-500">Order No</dt><dd className="mt-1 font-semibold">{record.orderNo}</dd></div>
                    <div><dt className="text-slate-500">Style</dt><dd className="mt-1 font-semibold">{record.styleName || "-"}</dd></div>
                    <div><dt className="text-slate-500">Brand</dt><dd className="mt-1 font-semibold">{record.brand || "-"}</dd></div>
                    <div><dt className="text-slate-500">Buyer</dt><dd className="mt-1 font-semibold">{record.buyer || "-"}</dd></div>
                  </dl>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Production Summary</p>
                    <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200">
                      <div className="text-center"><p className="text-[9px] uppercase text-slate-500">WO Qty</p><p className="mt-1 font-bold text-slate-900">{quantity(record.orderQty)}</p></div>
                      <div className="text-center"><p className="text-[9px] uppercase text-slate-500">Completed</p><p className="mt-1 font-bold text-emerald-700">{quantity(record.completedQty)}</p></div>
                      <div className="text-center"><p className="text-[9px] uppercase text-slate-500">Pending</p><p className="mt-1 font-bold text-amber-700">{quantity(record.pendingQty)}</p></div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">Flow Summary</p>
                    <div className="mt-3 grid grid-cols-3 divide-x divide-sky-200">
                      <div className="text-center"><p className="text-[9px] uppercase text-slate-500">In</p><p className="mt-1 font-bold text-sky-700">{quantity(record.flowInQty ?? 0)}</p><p className="text-[9px] text-slate-500">Accepted from previous</p></div>
                      <div className="text-center"><p className="text-[9px] uppercase text-slate-500">WIP</p><p className="mt-1 font-bold text-amber-700">{quantity(record.flowWipQty ?? 0)}</p><p className="text-[9px] text-slate-500">Accepted, not issued</p></div>
                      <div className="text-center"><p className="text-[9px] uppercase text-slate-500">Out</p><p className="mt-1 font-bold text-emerald-700">{quantity(record.flowOutIssuedQty ?? 0)} / {quantity(record.flowOutAcceptedQty ?? 0)}</p><p className="text-[9px] text-slate-500">Issued / accepted</p></div>
                    </div>
                  </div>
                  {(record.incomingTransfers ?? []).some((transfer) => transfer.pendingQty > 0) && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs">{(record.incomingTransfers ?? []).filter((transfer) => transfer.pendingQty > 0).map((transfer) => <div key={transfer.id} className="flex items-center justify-between border-b border-sky-100 py-2 last:border-b-0"><span>Pending from {transfer.fromProcessName}: {quantity(transfer.pendingQty)}</span><Button type="button" size="sm" onClick={() => { setAcceptTransfer({ id: transfer.id, sizeLines: transfer.sizeLines, operations: record.operations }); setAcceptedSizeQuantities({}); setGrnOperationQuantities({}); setGrnOperationBillable({}); }} className="min-h-0 rounded bg-sky-600 px-2 py-1 text-[10px] text-white hover:bg-sky-700">Create GRN</Button></div>)}</div>}
                  <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-emerald-700">View operations ({record.operations.length})</summary><div className="mt-3 space-y-2">{record.operations.map((operation) => <div key={operation.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs"><span>{operation.operation}</span><span className="font-semibold">{price(operation.actualPrice)}</span></div>)}</div></details>
                  <Button type="button" onClick={() => openUpdate(record)} className="mt-4 w-full border-emerald-600 bg-emerald-600 px-3 py-2 text-xs text-white hover:bg-emerald-700">Production Update</Button>
                  <Button type="button" variant="secondary" onClick={() => openTransfer(record)} disabled={!record.nextProcessId} className="mt-2 w-full border-sky-300 px-3 py-2 text-xs text-sky-700 hover:bg-sky-50">Bundle Transfer{record.nextProcessId ? " to next process" : " (last process)"}</Button>
                </Card>
              ))}
            </div>
            {paginationError && <Card role="alert" className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{paginationError}</Card>}
            {nextCursor && <div className="flex justify-center"><Button type="button" variant="secondary" onClick={() => void loadMoreRecords()} disabled={loadingMore} className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50">{loadingMore ? "Loading..." : "Load more work orders"}</Button></div>}
          </>
        )}
        {updateMessage && <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{updateMessage}</Card>}
        {transferMessage && <Card className="border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">{transferMessage}</Card>}
        {updateRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Production Update</p><h2 className="mt-1 text-xl font-bold text-slate-900">{updateRecord.processName} · {updateRecord.workOrderNo}</h2></div><Button type="button" variant="ghost" onClick={() => setUpdateRecord(null)} className="text-slate-500 hover:text-slate-900">Close</Button></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Select label="Update Level" value={updateLevel} onChange={(event) => setUpdateLevel(event.target.value as "PROCESS" | "OPERATION")} className="mt-1 rounded-lg border-slate-300 py-2 font-normal"><option value="PROCESS">Process level</option><option value="OPERATION">Operation level</option></Select>
                {updateLevel === "OPERATION" && <Select label="Operation" value={operationId} onChange={(event) => setOperationId(event.target.value)} className="mt-1 rounded-lg border-slate-300 py-2 font-normal"><option value="">Select operation</option>{updateRecord.operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.operation}</option>)}</Select>}
                <Input label="Completed Quantity" type="number" min="0" value={completedQty} onChange={(event) => setCompletedQty(event.target.value)} className="mt-1 rounded-lg border-slate-300 py-2 font-normal" />
              </div>
              {(updateRecord.sizeLines ?? []).length > 0 && <div className="mt-5"><p className="text-xs font-semibold text-slate-700">Size-wise Quantity</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{(updateRecord.sizeLines ?? []).map((line, index) => <label key={`${line.size}-${index}`} className="text-xs text-slate-600">{line.size || line.buyerSize || "Size"}<Input type="number" min="0" value={sizeQuantities[`${line.size ?? line.buyerSize ?? "size"}-${index}`] || ""} onChange={(event) => setSizeQuantities((current) => ({ ...current, [`${line.size ?? line.buyerSize ?? "size"}-${index}`]: event.target.value }))} className="mt-1 rounded-lg border-slate-300 py-2 text-slate-900" /></label>)}</div></div>}
              <div className="mt-5 rounded-lg border border-slate-200 p-4"><Checkbox label="Billable to vendor" checked={vendorBillable} onChange={(event) => setVendorBillable(event.target.checked)} className="text-xs font-semibold text-slate-700" />{vendorBillable && <Input label="Vendor Name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} className="mt-3 rounded-lg border-slate-300 py-2 font-normal" />}<Input label="Employee / Assigned By" value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} className="mt-3 rounded-lg border-slate-300 py-2 font-normal" /><Textarea label="Remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-3 min-h-20 rounded-lg border-slate-300 py-2 font-normal" /></div>
              <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setUpdateRecord(null)} className="border-slate-300 text-xs text-slate-700">Cancel</Button><Button type="button" onClick={() => void saveProductionUpdate()} disabled={savingUpdate} size="sm" className="border-emerald-600 bg-emerald-600 text-xs text-white">{savingUpdate ? "Saving..." : "Save Production Update"}</Button></div>
            </Card>
          </div>
        )}
        {transferRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-6">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Bundle Transfer</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{transferRecord.processName} to next process</h2>
                </div>
                <Button type="button" variant="ghost" onClick={() => setTransferRecord(null)} className="text-slate-500">Close</Button>
              </div>
              <Input
                label="Issued Quantity"
                type="number"
                min="0"
                value={transferQty}
                onChange={(event) => setTransferQty(event.target.value)}
                className="mt-5 rounded-lg border-slate-300 py-2 font-normal"
              />
              {(transferRecord.sizeLines ?? []).length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(transferRecord.sizeLines ?? []).map((line, index) => (
                    <label key={`${line.size}-${index}`} className="text-xs text-slate-600">
                      {line.size || line.buyerSize || "Size"}
                      <Input
                        type="number"
                        min="0"
                        value={transferSizeQuantities[`${line.size ?? line.buyerSize ?? "size"}-${index}`] || ""}
                        onChange={(event) => setTransferSizeQuantities((current) => ({ ...current, [`${line.size ?? line.buyerSize ?? "size"}-${index}`]: event.target.value }))}
                        className="mt-1 rounded-lg border-slate-300 py-2"
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setTransferRecord(null)} className="border-slate-300 text-xs">Cancel</Button>
                <Button type="button" onClick={() => void saveBundleTransfer()} disabled={savingTransfer} className="border-sky-600 bg-sky-600 text-xs text-white hover:bg-sky-700">
                  {savingTransfer ? "Sending..." : "Issue Bundle"}
                </Button>
              </div>
            </Card>
          </div>
        )}
        {acceptTransfer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">GRN Header + Subform</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Verify receipt and actual made</h2>
                </div>
                <Button type="button" variant="ghost" disabled={savingAccept} onClick={() => setAcceptTransfer(null)} className="text-slate-500 disabled:opacity-50">Close</Button>
              </div>
              <div className="mt-5 space-y-3">
                {acceptTransfer.sizeLines.map((line, index) => (
                  <label key={`${line.size}-${index}`} className="block text-xs text-slate-600">
                    {line.size || line.buyer_size || "Size"} · Pending {quantity(line.issued_qty - line.accepted_qty)}
                    <Input
                      type="number"
                      min="0"
                      max={line.issued_qty - line.accepted_qty}
                      disabled={savingAccept}
                      value={acceptedSizeQuantities[`${line.size ?? line.buyer_size ?? "size"}-${index}`] || ""}
                      onChange={(event) => setAcceptedSizeQuantities((current) => ({ ...current, [`${line.size ?? line.buyer_size ?? "size"}-${index}`]: event.target.value }))}
                      className="mt-1 rounded-lg border-slate-300 py-2 disabled:bg-slate-100"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Operation Subform</p>
                <div className="mt-3 space-y-3">
                  {acceptTransfer.operations.map((operation) => (
                    <div key={operation.id} className="grid gap-2 sm:grid-cols-[1fr_150px_auto] sm:items-end">
                      <label className="text-xs text-slate-600">
                        {operation.operation}
                        <Input
                          type="number"
                          min="0"
                          disabled={savingAccept}
                          value={grnOperationQuantities[operation.id] || ""}
                          onChange={(event) => setGrnOperationQuantities((current) => ({ ...current, [operation.id]: event.target.value }))}
                          className="mt-1 rounded-lg border-slate-300 py-2 disabled:bg-slate-100"
                          placeholder="Actual made"
                        />
                      </label>
                      <span className="text-xs text-slate-500">Budget {price(operation.budgetedPrice)}</span>
                      <Checkbox
                        label="Billable"
                        disabled={savingAccept}
                        checked={Boolean(grnOperationBillable[operation.id])}
                        onChange={(event) => setGrnOperationBillable((current) => ({ ...current, [operation.id]: event.target.checked }))}
                        className="mb-2"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {transferMessage && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{transferMessage}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={savingAccept} onClick={() => setAcceptTransfer(null)}>Cancel</Button>
                <Button type="button" disabled={savingAccept} onClick={() => void acceptBundleTransfer()} className="border-sky-600 bg-sky-600 hover:bg-sky-700 disabled:opacity-60">
                  {savingAccept ? "Saving GRN..." : "Save GRN"}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </Section>
    </Page>
  );
}
