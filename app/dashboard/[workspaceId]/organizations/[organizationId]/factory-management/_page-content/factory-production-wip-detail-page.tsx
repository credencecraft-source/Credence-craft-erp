"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

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
  sizeLines?: Array<{ size: string | null; buyerSize: string | null; quantity: number }>;
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
  incomingTransfers?: Array<{ id: string; issuedQty: number; acceptedQty: number; pendingQty: number; status: string; fromProcessName: string; sizeLines: Array<{ size: string | null; buyer_size?: string | null; issued_qty: number; accepted_qty: number }> }>;
  outgoingTransfers?: Array<{ id: string; issuedQty: number; acceptedQty: number; pendingQty: number; status: string; toProcessId: string; toProcessName: string }>;
};

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");
const price = (value: number | null) => value === null ? "-" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FactoryProductionWipDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; processRecordId: string }>();
  const organizationId = params?.organizationId ?? "demo-org";
  const processRecordId = params?.processRecordId ?? "";
  const [records, setRecords] = useState<WipRecord[]>([]);
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
  const [acceptTransfer, setAcceptTransfer] = useState<{ id: string; sizeLines: Array<{ size: string | null; buyer_size?: string | null; issued_qty: number; accepted_qty: number }>; operations: WipOperation[] } | null>(null);
  const [acceptedSizeQuantities, setAcceptedSizeQuantities] = useState<Record<string, string>>({});
  const [grnOperationQuantities, setGrnOperationQuantities] = useState<Record<string, string>>({});
  const [grnOperationBillable, setGrnOperationBillable] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/factory/production/wip?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load process details.");
        return data;
      })
      .then((data) => {
        const match = Array.isArray(data.workInProgress)
          ? data.workInProgress.filter((item: WipRecord) => item.processName === processRecordId)
          : [];
        if (active) {
          if (match.length > 0) setRecords(match);
          else setError("The work-order process could not be found.");
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
      setRecords((current) => current.map((record) => record.id === updateRecord.id ? { ...record, completedQty: record.completedQty + Number(data.productionUpdate.completed_qty), pendingQty: Math.max(record.pendingQty - Number(data.productionUpdate.completed_qty), 0) } : record));
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
      const sizeLines = (transferRecord.sizeLines ?? []).map((line, index) => ({ size: line.size, buyerSize: line.buyerSize, quantity: Number(transferSizeQuantities[`${line.size ?? line.buyerSize ?? "size"}-${index}`] || 0) })).filter((line) => line.quantity > 0);
      const response = await fetch("/api/factory/production/bundle-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "ISSUE", workOrderId: transferRecord.workOrderId, fromProcessId: transferRecord.processId, toProcessId: transferRecord.nextProcessId, completedQty: Number(transferQty || 0), sizeLines }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to issue bundle transfer.");
      setTransferRecord(null);
      setTransferMessage("Bundle transfer issued to the next process.");
    } catch (transferError) {
      setTransferMessage(transferError instanceof Error ? transferError.message : "Unable to issue bundle transfer.");
    } finally {
      setSavingTransfer(false);
    }
  }

  async function acceptBundleTransfer() {
    if (!acceptTransfer) return;
    const sizeLines = acceptTransfer.sizeLines.map((line, index) => ({ size: line.size, buyerSize: line.buyer_size, quantity: Number(acceptedSizeQuantities[`${line.size ?? line.buyer_size ?? "size"}-${index}`] || 0) })).filter((line) => line.quantity > 0);
    const operationLines = acceptTransfer.operations.map((operation) => ({ operationId: operation.id, operationName: operation.operation, actualMadeQty: Number(grnOperationQuantities[operation.id] || 0), billable: Boolean(grnOperationBillable[operation.id]) })).filter((line) => line.actualMadeQty > 0);
    const response = await fetch("/api/factory/production/bundle-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "ACCEPT", transferId: acceptTransfer.id, sizeLines, operationLines }) });
    const data = await response.json();
    if (!response.ok) setTransferMessage(data.error || "Unable to accept bundle transfer.");
    else { setTransferMessage("GRN saved and bundle received."); setAcceptTransfer(null); }
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
                  {(record.incomingTransfers ?? []).some((transfer) => transfer.pendingQty > 0) && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs">{(record.incomingTransfers ?? []).filter((transfer) => transfer.pendingQty > 0).map((transfer) => <div key={transfer.id} className="flex items-center justify-between border-b border-sky-100 py-2 last:border-b-0"><span>Pending from {transfer.fromProcessName}: {quantity(transfer.pendingQty)}</span><button type="button" onClick={() => { setAcceptTransfer({ id: transfer.id, sizeLines: transfer.sizeLines, operations: record.operations }); setAcceptedSizeQuantities({}); setGrnOperationQuantities({}); setGrnOperationBillable({}); }} className="rounded bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white">Create GRN</button></div>)}</div>}
                  <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-emerald-700">View operations ({record.operations.length})</summary><div className="mt-3 space-y-2">{record.operations.map((operation) => <div key={operation.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs"><span>{operation.operation}</span><span className="font-semibold">{price(operation.actualPrice)}</span></div>)}</div></details>
                  <button type="button" onClick={() => openUpdate(record)} className="mt-4 w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Production Update</button>
                  <button type="button" onClick={() => openTransfer(record)} disabled={!record.nextProcessId} className="mt-2 w-full rounded-lg border border-sky-300 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">Bundle Transfer{record.nextProcessId ? " to next process" : " (last process)"}</button>
                </Card>
              ))}
            </div>
          </>
        )}
        {updateMessage && <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{updateMessage}</Card>}
        {transferMessage && <Card className="border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">{transferMessage}</Card>}
        {updateRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Production Update</p><h2 className="mt-1 text-xl font-bold text-slate-900">{updateRecord.processName} · {updateRecord.workOrderNo}</h2></div><button type="button" onClick={() => setUpdateRecord(null)} className="text-slate-500 hover:text-slate-900">Close</button></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">Update Level<select value={updateLevel} onChange={(event) => setUpdateLevel(event.target.value as "PROCESS" | "OPERATION")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="PROCESS">Process level</option><option value="OPERATION">Operation level</option></select></label>
                {updateLevel === "OPERATION" && <label className="text-xs font-semibold text-slate-700">Operation<select value={operationId} onChange={(event) => setOperationId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="">Select operation</option>{updateRecord.operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.operation}</option>)}</select></label>}
                <label className="text-xs font-semibold text-slate-700">Completed Quantity<input type="number" min="0" value={completedQty} onChange={(event) => setCompletedQty(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
              </div>
              {(updateRecord.sizeLines ?? []).length > 0 && <div className="mt-5"><p className="text-xs font-semibold text-slate-700">Size-wise Quantity</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{(updateRecord.sizeLines ?? []).map((line, index) => <label key={`${line.size}-${index}`} className="text-xs text-slate-600">{line.size || line.buyerSize || "Size"}<input type="number" min="0" value={sizeQuantities[`${line.size ?? line.buyerSize ?? "size"}-${index}`] || ""} onChange={(event) => setSizeQuantities((current) => ({ ...current, [`${line.size ?? line.buyerSize ?? "size"}-${index}`]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>)}</div></div>}
              <div className="mt-5 rounded-lg border border-slate-200 p-4"><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={vendorBillable} onChange={(event) => setVendorBillable(event.target.checked)} />Billable to vendor</label>{vendorBillable && <label className="mt-3 block text-xs font-semibold text-slate-700">Vendor Name<input value={vendorName} onChange={(event) => setVendorName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>}<label className="mt-3 block text-xs font-semibold text-slate-700">Employee / Assigned By<input value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label><label className="mt-3 block text-xs font-semibold text-slate-700">Remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label></div>
              <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setUpdateRecord(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">Cancel</button><button type="button" onClick={() => void saveProductionUpdate()} disabled={savingUpdate} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{savingUpdate ? "Saving..." : "Save Production Update"}</button></div>
            </Card>
          </div>
        )}
        {transferRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-6"><div className="flex justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Bundle Transfer</p><h2 className="mt-1 text-xl font-bold text-slate-900">{transferRecord.processName} to next process</h2></div><button type="button" onClick={() => setTransferRecord(null)} className="text-slate-500">Close</button></div><label className="mt-5 block text-xs font-semibold text-slate-700">Issued Quantity<input type="number" min="0" value={transferQty} onChange={(event) => setTransferQty(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>{(transferRecord.sizeLines ?? []).length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{(transferRecord.sizeLines ?? []).map((line, index) => <label key={`${line.size}-${index}`} className="text-xs text-slate-600">{line.size || line.buyerSize || "Size"}<input type="number" min="0" value={transferSizeQuantities[`${line.size ?? line.buyerSize ?? "size"}-${index}`] || ""} onChange={(event) => setTransferSizeQuantities((current) => ({ ...current, [`${line.size ?? line.buyerSize ?? "size"}-${index}`]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>)}</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setTransferRecord(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Cancel</button><button type="button" onClick={() => void saveBundleTransfer()} disabled={savingTransfer} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{savingTransfer ? "Sending..." : "Issue Bundle"}</button></div></Card></div>}
        {acceptTransfer && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6"><div className="flex justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">GRN Header + Subform</p><h2 className="mt-1 text-xl font-bold text-slate-900">Verify receipt and actual made</h2></div><button type="button" onClick={() => setAcceptTransfer(null)} className="text-slate-500">Close</button></div><div className="mt-5 space-y-3">{acceptTransfer.sizeLines.map((line, index) => <label key={`${line.size}-${index}`} className="block text-xs text-slate-600">{line.size || line.buyer_size || "Size"} · Pending {quantity(line.issued_qty - line.accepted_qty)}<input type="number" min="0" max={line.issued_qty - line.accepted_qty} value={acceptedSizeQuantities[`${line.size ?? line.buyer_size ?? "size"}-${index}`] || ""} onChange={(event) => setAcceptedSizeQuantities((current) => ({ ...current, [`${line.size ?? line.buyer_size ?? "size"}-${index}`]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>)}</div><div className="mt-5 rounded-lg border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Operation Subform</p><div className="mt-3 space-y-3">{acceptTransfer.operations.map((operation) => <div key={operation.id} className="grid gap-2 sm:grid-cols-[1fr_150px_auto] sm:items-end"><label className="text-xs text-slate-600">{operation.operation}<input type="number" min="0" value={grnOperationQuantities[operation.id] || ""} onChange={(event) => setGrnOperationQuantities((current) => ({ ...current, [operation.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Actual made" /></label><span className="text-xs text-slate-500">Budget {price(operation.budgetedPrice)}</span><label className="flex items-center gap-2 pb-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={Boolean(grnOperationBillable[operation.id])} onChange={(event) => setGrnOperationBillable((current) => ({ ...current, [operation.id]: event.target.checked }))} />Billable</label></div>)}</div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setAcceptTransfer(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Cancel</button><button type="button" onClick={() => void acceptBundleTransfer()} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white">Save GRN</button></div></Card></div>}
      </Section>
    </Page>
  );
}
