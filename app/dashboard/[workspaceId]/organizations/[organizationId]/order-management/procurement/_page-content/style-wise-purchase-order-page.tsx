"use client";

import { ArrowLeft, Check, ChevronDown, ChevronRight, ClipboardCheck, Loader2, PackageSearch, Search, Store, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type BomRow = {
  id: string;
  orderId: string;
  orderNo: string | null;
  styleName: string | null;
  brand: string | null;
  category: string | null;
  subCategory: string | null;
  itemName: string | null;
  internalConsumption: number | null;
  requiredQty: number | null;
};

type VendorOption = { id: string; label: string };
type MaterialGroup = {
  key: string;
  rawMaterialName: string;
  category: string;
  subCategory: string;
  groupedQty: number;
  rows: BomRow[];
};
type GroupedLine = Omit<BomRow, "orderId"> & { groupedQty: string; vendorPrice: string };
type GroupedPurchaseOrder = {
  id: string;
  groupedPoNo: string;
  status: string;
  submittedAt: string;
  rejectionReason: string | null;
  note?: string | null;
  rawMaterial?: string | null;
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  brand?: string | null;
  totalRequiredQty?: number | null;
  totalGroupedQty?: number | null;
  noOfStyles?: number | null;
  buyingUom?: string | null;
  convertValue?: number | null;
  roundOf?: boolean;
  buyingQty?: number | null;
  buyingQtyRound?: number | null;
  differenceRound?: number | null;
  moqStockUom?: number | null;
  moqBuying?: number | null;
  extraBuyingUom?: number | null;
  buyingQtyTotal?: number | null;
    vendorPrice?: number | null;
    vendorPriceInr?: number | null;
  otherChargesInr?: number | null;
  vendor: { id: string; name: string };
  lines: Array<{
    id: string;
    bomItemId: string;
    orderNo: string | null;
    styleName: string | null;
    brand: string | null;
    category: string | null;
    subCategory: string | null;
    itemName: string | null;
    internalConsumption: number | null;
    requiredQty: number | null;
    groupedQty: number | null;
    vendorPrice: number | null;
    categoryType?: string | null;
    internalPriceBom?: number | null;
    otherChargesPerItem?: number | null;
    totalExtra?: number | null;
    totalSpend?: number | null;
  }>;
};

type Stage = "allocate" | "price" | "create";

const formatNumber = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const text = (value: unknown, fallback = "-") => value === null || value === undefined || value === "" ? fallback : String(value);

export default function StyleWisePurchaseOrderPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;
  const [stage, setStage] = useState<Stage>("allocate");
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [groupedPurchaseOrders, setGroupedPurchaseOrders] = useState<GroupedPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceLoading, setPriceLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGroupedForm, setShowGroupedForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadAllocatableRows = async () => {
    const response = await fetch(`/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}&view=allocatable`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load raw-material rows.");
    setBomRows(data.bomRows ?? []);
  };

  const loadVendors = async () => {
    const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/vendor?includeInactive=false`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load vendors.");
    setVendors((Array.isArray(data) ? data : []).map((value: { id: string; label: string }) => ({ id: value.id, label: value.label })));
  };

  const loadPriceApprovals = async (view = "price-approval") => {
    setPriceLoading(true);
    try {
      const response = await fetch(`/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}&view=${view}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load price approvals.");
      setGroupedPurchaseOrders(data.groupedPurchaseOrders ?? []);
    } finally {
      setPriceLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([loadAllocatableRows(), loadVendors()])
      .catch((loadError) => { if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load procurement."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [organizationId]);

  useEffect(() => {
    if (stage !== "price" && stage !== "create") return;
    loadPriceApprovals(stage === "create" ? "all" : "price-approval").catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load price approvals."));
  }, [stage, organizationId]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return bomRows;
    return bomRows.filter((row) => [row.orderNo, row.styleName, row.brand, row.category, row.subCategory, row.itemName].some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [bomRows, search]);

  const materialGroups = useMemo<MaterialGroup[]>(() => {
    const grouped = new Map<string, MaterialGroup>();
    for (const row of bomRows) {
      const rawMaterialName = text(row.itemName, "Unclassified material");
      const category = text(row.category, "General");
      const subCategory = text(row.subCategory, "Uncategorised");
      const key = `${rawMaterialName.toLowerCase()}|${category.toLowerCase()}|${subCategory.toLowerCase()}`;
      const group = grouped.get(key) ?? { key, rawMaterialName, category, subCategory, groupedQty: 0, rows: [] };
      group.groupedQty += Number(row.requiredQty ?? 0);
      group.rows.push(row);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((left, right) => left.rawMaterialName.localeCompare(right.rawMaterialName));
  }, [bomRows]);

  const filteredMaterialGroups = materialGroups.filter((group) => {
    const needle = search.trim().toLowerCase();
    return !needle || `${group.rawMaterialName} ${group.category} ${group.subCategory}`.toLowerCase().includes(needle);
  });
  const selectedMaterial = materialGroups.find((group) => group.key === selectedMaterialKey) ?? null;

  const selectedRows = bomRows.filter((row) => selectedIds.has(row.id));
  const toggleAll = () => setSelectedIds((current) => current.size === filteredRows.length ? new Set() : new Set(filteredRows.map((row) => row.id)));
  const toggleRow = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openPriceStage = () => {
    setError("");
    setNotice("");
    setStage("price");
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-3">
      <header className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <button type="button" onClick={() => router.push(procurementPath)} aria-label="Back to procurement" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Procurement</p><h1 className="truncate text-lg font-bold text-slate-950">Style Wise PO</h1></div>
        <div className="ml-auto hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Grouped purchase workflow</div>
      </header>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:grid-cols-3">
        <StageButton number="01" label="Allocate vendor" active={stage === "allocate"} onClick={() => setStage("allocate")} icon={PackageSearch} />
        <StageButton number="02" label="Approve price" active={stage === "price"} onClick={openPriceStage} icon={ClipboardCheck} />
        <StageButton number="03" label="Create PO" active={stage === "create"} onClick={() => setStage("create")} icon={Check} />
      </div>

      {notice && <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><Check className="h-4 w-4" />{notice}</div>}
      {error && <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}

      {stage === "allocate" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Stage 1</p><h2 className="text-sm font-bold text-slate-950">Allocate vendor to raw materials</h2></div><div className="flex items-center gap-2"><div className="relative w-60"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search material or subcategory" className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-emerald-500" /></div>{selectedMaterial && <button type="button" onClick={() => setShowGroupedForm(true)} disabled={selectedRows.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Store className="h-3.5 w-3.5" /> Allocate vendor <span className="rounded bg-white/20 px-1.5">{selectedRows.length}</span></button>}</div></div>
          {loading ? <div className="erp-surface flex min-h-40 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading raw materials</div> : selectedMaterial ? <MaterialDetail group={selectedMaterial} selectedIds={selectedIds} onBack={() => { setSelectedMaterialKey(null); setSelectedIds(new Set()); }} onToggleRow={toggleRow} onToggleAll={() => setSelectedIds((current) => current.size === selectedMaterial.rows.length ? new Set() : new Set(selectedMaterial.rows.map((row) => row.id)))} /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredMaterialGroups.map((group) => <MaterialGroupCard key={group.key} group={group} onClick={() => { setSelectedMaterialKey(group.key); setSelectedIds(new Set()); }} />)}{filteredMaterialGroups.length === 0 && <div className="erp-surface col-span-full p-8 text-center text-xs text-slate-500">No unallocated raw-material groups found.</div>}</div>}
        </section>
      ) : stage === "price" ? <PriceApprovalStage groupedPurchaseOrders={groupedPurchaseOrders} loading={priceLoading} organizationId={organizationId} onUpdated={loadPriceApprovals} onApproved={() => setStage("create")} onError={setError} /> : <CreatePoStage groupedPurchaseOrders={groupedPurchaseOrders} />}

      {showGroupedForm && <GroupedPurchaseOrderForm rows={selectedRows} vendors={vendors} organizationId={organizationId} onClose={() => setShowGroupedForm(false)} onCreated={() => { setShowGroupedForm(false); setSelectedIds(new Set()); setNotice("Grouped PO submitted for Stage 2 price approval."); void loadAllocatableRows(); }} onError={setError} />}
    </div>
  );
}

function MaterialGroupCard({ group, onClick }: { group: MaterialGroup; onClick: () => void }) {
  const orderCount = new Set(group.rows.map((row) => row.orderNo)).size;
  return <button type="button" onClick={onClick} className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">{group.category}</p><h3 className="mt-1 truncate text-base font-bold text-slate-950">{group.rawMaterialName}</h3><p className="mt-1 truncate text-xs text-slate-500">{group.subCategory}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-700" /></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3"><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Grouped Qty</p><p className="mt-1 text-xl font-bold text-slate-950">{formatNumber(group.groupedQty)}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Related Orders</p><p className="mt-1 text-xl font-bold text-slate-950">{orderCount}</p></div></div><p className="mt-3 text-[10px] text-slate-500">{group.rows.length} BOM line{group.rows.length === 1 ? "" : "s"} · Click to view details</p></button>;
}

function MaterialDetail({ group, selectedIds, onBack, onToggleRow, onToggleAll }: { group: MaterialGroup; selectedIds: Set<string>; onBack: () => void; onToggleRow: (id: string) => void; onToggleAll: () => void }) {
  const allSelected = group.rows.length > 0 && group.rows.every((row) => selectedIds.has(row.id));
  return <section className="erp-surface overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div className="flex items-center gap-2"><button type="button" onClick={onBack} aria-label="Back to raw-material groups" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-3.5 w-3.5" /></button><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Selected raw material</p><h3 className="mt-1 text-sm font-bold text-slate-950">{group.rawMaterialName} · {group.subCategory}</h3></div></div><div className="text-right"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Selected records</p><p className="text-lg font-bold text-emerald-700">{selectedIds.size}</p></div></div><div className="border-b border-slate-200 px-4 py-2 text-[10px] text-slate-500">Select the BOM order records you want to include, then click Allocate Vendor above.</div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-[10px]"><thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-2.5 py-2"><input type="checkbox" aria-label="Select all related BOM records" checked={allSelected} onChange={onToggleAll} /></th><th className="px-2.5 py-2">Order Name</th><th className="px-2.5 py-2">Style Name</th><th className="px-2.5 py-2">Brand</th><th className="px-2.5 py-2">Category</th><th className="px-2.5 py-2">Subcategory</th><th className="px-2.5 py-2">Item</th><th className="px-2.5 py-2">Internal Consumption</th><th className="px-2.5 py-2 text-right">Required Qty</th></tr></thead><tbody className="divide-y divide-slate-100">{group.rows.map((row) => <tr key={row.id} className={selectedIds.has(row.id) ? "bg-emerald-50/60" : "hover:bg-emerald-50/40"}><td className="px-2.5 py-2"><input type="checkbox" aria-label={`Select ${text(row.orderNo)} BOM record`} checked={selectedIds.has(row.id)} onChange={() => onToggleRow(row.id)} /></td><td className="px-2.5 py-2 font-semibold text-slate-800">{text(row.orderNo)}</td><td className="px-2.5 py-2 text-slate-700">{text(row.styleName)}</td><td className="px-2.5 py-2 text-slate-700">{text(row.brand)}</td><td className="px-2.5 py-2 text-slate-700">{text(row.category)}</td><td className="px-2.5 py-2 text-slate-700">{text(row.subCategory)}</td><td className="px-2.5 py-2 font-semibold text-slate-900">{text(row.itemName)}</td><td className="px-2.5 py-2 text-slate-700">{formatNumber(row.internalConsumption)}</td><td className="px-2.5 py-2 text-right font-bold text-slate-900">{formatNumber(row.requiredQty)}</td></tr>)}</tbody></table></div></section>;
}

function StageButton({ number, label, active, disabled, onClick, icon: Icon }: { number: string; label: string; active: boolean; disabled?: boolean; onClick?: () => void; icon: typeof Check }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-emerald-300"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}>{number}</span><Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" /><span className="truncate text-[10px] font-semibold text-slate-700">{label}</span></button>;
}

function GroupedPurchaseOrderForm({ rows, vendors, organizationId, onClose, onCreated, onError }: { rows: BomRow[]; vendors: VendorOption[]; organizationId: string; onClose: () => void; onCreated: () => void; onError: (message: string) => void }) {
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.id, String(row.requiredQty ?? "")] )));
  const [submitting, setSubmitting] = useState(false);
  const updateQty = (id: string, value: string, requiredQty: number | null) => setLines((current) => ({ ...current, [id]: value === "" ? "" : String(Math.min(Number(value), Number(requiredQty ?? 0))) }));
  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, vendorId, lines: rows.map((row) => ({ bomItemId: row.id, groupedQty: lines[row.id] })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to submit grouped PO.");
      onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to submit grouped PO.");
    } finally {
      setSubmitting(false);
    }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" role="dialog" aria-modal="true" aria-labelledby="grouped-po-title"><div className="flex max-h-[92vh] w-full max-w-[1250px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">New grouped PO</p><h2 id="grouped-po-title" className="mt-1 text-lg font-bold text-slate-950">Allocate selected raw materials</h2><p className="mt-1 text-xs text-slate-500">This grouped PO will be submitted to Stage 2 price approval.</p></div><button type="button" onClick={onClose} aria-label="Close grouped PO form" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button></div><div className="border-b border-slate-200 bg-slate-50 px-5 py-3"><label className="block max-w-sm text-xs font-bold text-slate-700">Vendor lookup<select value={vendorId} onChange={(event) => setVendorId(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500"><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.label}</option>)}</select></label></div><div className="min-h-0 overflow-auto p-5"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-slate-900">Grouped PO subform</p><span className="text-[10px] text-slate-500">{rows.length} selected lines</span></div><table className="w-full min-w-[1050px] text-left text-[10px]"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-2.5 py-2">Order Name</th><th className="px-2.5 py-2">Style Name</th><th className="px-2.5 py-2">Brand</th><th className="px-2.5 py-2">Category</th><th className="px-2.5 py-2">Subcategory</th><th className="px-2.5 py-2">Item</th><th className="px-2.5 py-2">Internal Consumption</th><th className="px-2.5 py-2 text-right">Required Qty</th><th className="px-2.5 py-2 text-right">Grouped Qty</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id}><td className="px-2.5 py-2 font-semibold text-slate-800">{text(row.orderNo)}</td><td className="px-2.5 py-2">{text(row.styleName)}</td><td className="px-2.5 py-2">{text(row.brand)}</td><td className="px-2.5 py-2">{text(row.category)}</td><td className="px-2.5 py-2">{text(row.subCategory)}</td><td className="px-2.5 py-2 font-semibold text-slate-900">{text(row.itemName)}</td><td className="px-2.5 py-2">{formatNumber(row.internalConsumption)}</td><td className="px-2.5 py-2 text-right font-bold">{formatNumber(row.requiredQty)}</td><td className="px-2.5 py-2 text-right"><input type="number" min="0" max={row.requiredQty ?? undefined} step="0.01" value={lines[row.id] ?? ""} onChange={(event) => updateQty(row.id, event.target.value, row.requiredQty)} className="w-28 rounded border border-slate-300 px-2 py-1 text-right outline-none focus:border-emerald-500" /></td></tr>)}</tbody></table></div><div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3"><button type="button" onClick={onClose} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" disabled={!vendorId || submitting} onClick={submit} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">{submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Submit grouped PO</button></div></div></div>;
}

function PriceApprovalStage({ groupedPurchaseOrders, loading, organizationId, onUpdated, onApproved, onError }: { groupedPurchaseOrders: GroupedPurchaseOrder[]; loading: boolean; organizationId: string; onUpdated: () => Promise<void>; onApproved: () => void; onError: (message: string) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pendingOrders = groupedPurchaseOrders.filter((item) => item.status === "PENDING_PRICE_APPROVAL");
  const approveSelectedRecords = async () => {
    setApproving(true);
    try {
      for (const order of pendingOrders.filter((item) => selectedIds.has(item.id))) {
        const response = await fetch(`/api/orders/procurement/${encodeURIComponent(order.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "approve" }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || `Unable to approve ${order.groupedPoNo}.`);
      }
      setSelectedIds(new Set());
      await onUpdated();
      onApproved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to approve grouped POs.");
    } finally {
      setApproving(false);
    }
  };
  if (loading) return <div className="erp-surface flex min-h-40 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading price approvals</div>;
  const selectedCount = pendingOrders.filter((item) => selectedIds.has(item.id)).length;
  return <section className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700">Stage 2</p><h2 className="text-sm font-bold text-slate-950">Approve vendor prices</h2><p className="mt-1 text-xs text-slate-500">Select records from the report, then approve them into Stage 3.</p></div><button type="button" disabled={approving || selectedCount === 0} onClick={approveSelectedRecords} className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">{approving ? "Approving..." : `Approve price${selectedCount ? ` (${selectedCount})` : ""}`}</button></div>{groupedPurchaseOrders.length === 0 ? <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">No grouped POs are waiting for price approval.</div> : <div className="erp-surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-3 py-3">Select</th><th className="px-3 py-3">Grouped PO</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Grouped Qty</th><th className="px-3 py-3 text-right">Lines</th><th className="px-3 py-3">Submitted</th></tr></thead><tbody className="divide-y divide-slate-100">{groupedPurchaseOrders.map((order) => { const pending = order.status === "PENDING_PRICE_APPROVAL"; const selected = selectedIds.has(order.id); const expanded = expandedId === order.id; return <><tr key={order.id} onClick={() => setExpandedId(expanded ? null : order.id)} className={`cursor-pointer transition hover:bg-blue-50 ${expanded ? "bg-blue-50" : "bg-white"}`}><td className="px-3 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${order.groupedPoNo}`} disabled={!pending} checked={selected} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(order.id)) next.delete(order.id); else next.add(order.id); return next; })} /></td><td className="px-3 py-3 font-bold text-slate-900">{order.groupedPoNo}</td><td className="px-3 py-3 text-slate-700">{order.vendor.name}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${pending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{pending ? "Pending price" : "Approved"}</span></td><td className="px-3 py-3 text-right font-bold text-slate-900">{formatNumber(order.totalGroupedQty ?? order.lines.reduce((total, line) => total + Number(line.groupedQty ?? 0), 0))}</td><td className="px-3 py-3 text-right text-slate-700">{order.lines.length}</td><td className="px-3 py-3 text-slate-600">{new Date(order.submittedAt).toLocaleDateString()}</td></tr>{expanded && <tr key={`${order.id}-detail`}><td colSpan={7} className="bg-slate-50 p-3"><DetailedPriceApprovalCard order={order} expanded onToggle={() => setExpandedId(null)} organizationId={organizationId} onUpdated={onUpdated} onError={onError} /></td></tr>}</>; })}</tbody></table></div></div>}</section>;
}

function CreatePoStage({ groupedPurchaseOrders }: { groupedPurchaseOrders: GroupedPurchaseOrder[] }) {
  const approvedOrders = groupedPurchaseOrders.filter((order) => order.status === "PRICE_APPROVED");
  return <section className="space-y-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Stage 3</p><h2 className="text-sm font-bold text-slate-950">Create purchase order</h2><p className="mt-1 text-xs text-slate-500">Approved grouped records are ready to become purchase orders.</p></div>{approvedOrders.length === 0 ? <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">No approved grouped records are ready for PO creation.</div> : <div className="erp-surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Grouped PO</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3">Raw Material</th><th className="px-3 py-3 text-right">Grouped Qty</th><th className="px-3 py-3 text-right">Lines</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{approvedOrders.map((order) => <tr key={order.id} className="hover:bg-emerald-50/40"><td className="px-3 py-3 font-bold text-slate-900">{order.groupedPoNo}</td><td className="px-3 py-3 text-slate-700">{order.vendor.name}</td><td className="px-3 py-3 text-slate-700">{text(order.rawMaterial)}</td><td className="px-3 py-3 text-right font-bold">{formatNumber(order.totalGroupedQty)}</td><td className="px-3 py-3 text-right">{order.lines.length}</td><td className="px-3 py-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-800">Price approved</span></td></tr>)}</tbody></table></div></div>}</section>;
}

function DetailedPriceApprovalCard({ order, expanded, onToggle, organizationId, onUpdated, onError }: { order: GroupedPurchaseOrder; expanded: boolean; onToggle: () => void; organizationId: string; onUpdated: () => Promise<void>; onError: (message: string) => void }) {
  const [note, setNote] = useState(order.note ?? "");
  const [vendorPriceInr, setVendorPriceInr] = useState(String(order.vendorPriceInr ?? order.vendorPrice ?? ""));
  const [otherChargesInr, setOtherChargesInr] = useState(String(order.otherChargesInr ?? "0"));
  const [convertValue, setConvertValue] = useState(String(order.convertValue ?? "1"));
  const [moqStockUom, setMoqStockUom] = useState(String(order.moqStockUom ?? "0"));
  const [buyingUom, setBuyingUom] = useState(order.buyingUom ?? "");
  const [roundOf, setRoundOf] = useState(Boolean(order.roundOf));
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const saveHeader = async (action: "update-header" | "approve" | "reject") => {
    setSaving(true);
    setActionError("");
    try {
      const body = action === "update-header" || action === "approve" ? { organizationId, action: "update-header", note, vendorPriceInr, vendorPrice: vendorPriceInr, otherChargesInr, convertValue, moqStockUom, buyingUom, roundOf } : { organizationId, action, prices: order.lines.map((line) => ({ lineId: line.id, vendorPrice: vendorPriceInr })), reason: "Price requires correction." };
      const response = await fetch(`/api/orders/procurement/${encodeURIComponent(order.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update grouped PO.");
      await onUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update grouped PO.";
      setActionError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="erp-surface overflow-hidden"><button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"><span className="flex min-w-0 items-center gap-2">{expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}<span className="min-w-0"><span className="block text-xs font-bold text-slate-950">{order.groupedPoNo}</span><span className="block text-[10px] text-slate-500">{order.vendor.name} · {order.lines.length} subform lines · {new Date(order.submittedAt).toLocaleDateString()}</span></span></span><span className="text-xs font-bold text-emerald-700">{formatNumber(order.totalGroupedQty ?? order.lines.reduce((total, line) => total + Number(line.groupedQty ?? 0), 0))} qty</span></button>{expanded && <div className="space-y-4 border-t border-slate-200 p-4"><div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Vendor" value={order.vendor.name} readOnly /><Field label="Raw material" value={text(order.rawMaterial)} readOnly /><Field label="Category / subcategory" value={`${text(order.category)} / ${text(order.subCategory)}`} readOnly /><Field label="No. of styles" value={String(order.noOfStyles ?? order.lines.length)} readOnly /><Field label="Vendor Price INR" value={vendorPriceInr} onChange={setVendorPriceInr} /><Field label="Other Charges INR" value={otherChargesInr} onChange={setOtherChargesInr} /><Field label="Convert Value" value={convertValue} onChange={setConvertValue} /><Field label="Buying UOM" value={buyingUom} onChange={setBuyingUom} /><Field label="MOQ Stock UOM" value={moqStockUom} onChange={setMoqStockUom} /><label className="flex items-center gap-2 self-end rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={roundOf} onChange={(event) => setRoundOf(event.target.checked)} /> Round buying quantity</label><label className="sm:col-span-2 lg:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500" /></label></div><div className="grid gap-2 sm:grid-cols-4"><SummaryField label="Buying Qty" value={order.buyingQty} /><SummaryField label="Round-off Qty" value={order.buyingQtyRound} /><SummaryField label="Extra Buying UOM" value={order.extraBuyingUom} /><SummaryField label="Buying Qty Total" value={order.buyingQtyTotal} /></div>{actionError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}<div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-[10px]"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Grouping / Order</th><th className="px-2 py-2">Style</th><th className="px-2 py-2">Raw material</th><th className="px-2 py-2 text-right">Required Qty</th><th className="px-2 py-2 text-right">Grouped Qty</th><th className="px-2 py-2 text-right">Internal Price BOM</th><th className="px-2 py-2 text-right">Vendor Price</th><th className="px-2 py-2 text-right">Other Charges / Item</th><th className="px-2 py-2 text-right">Total Extra</th><th className="px-2 py-2 text-right">Total Spend</th></tr></thead><tbody className="divide-y divide-slate-100">{order.lines.map((line) => <tr key={line.id}><td className="px-2 py-2 font-semibold text-slate-800">{text(line.orderNo)}</td><td className="px-2 py-2">{text(line.styleName)}</td><td className="px-2 py-2 font-semibold text-slate-900">{text(line.itemName)}</td><td className="px-2 py-2 text-right">{formatNumber(line.requiredQty)}</td><td className="px-2 py-2 text-right">{formatNumber(line.groupedQty)}</td><td className="px-2 py-2 text-right">{formatNumber(line.internalPriceBom)}</td><td className="px-2 py-2 text-right font-bold text-emerald-700">{formatNumber(Number(vendorPriceInr || line.vendorPrice || 0))}</td><td className="px-2 py-2 text-right">{formatNumber(line.otherChargesPerItem)}</td><td className="px-2 py-2 text-right">{formatNumber(line.totalExtra)}</td><td className="px-2 py-2 text-right font-bold">{formatNumber(line.totalSpend)}</td></tr>)}</tbody></table></div><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => saveHeader("update-header")} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Save header and propagate price</button><button type="button" disabled={saving} onClick={() => saveHeader("approve")} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">Approve price</button><button type="button" disabled={saving} onClick={() => saveHeader("reject")} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60">Reject</button></div></div>}</div>;
}

function Field({ label, value, onChange, readOnly }: { label: string; value: string; onChange?: (value: string) => void; readOnly?: boolean }) {
  return <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><input readOnly={readOnly} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={`w-full rounded border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500 ${readOnly ? "bg-slate-100 text-slate-600" : "bg-white"}`} /></label>;
}

function SummaryField({ label, value }: { label: string; value?: number | null }) {
  return <div className="rounded border border-slate-200 bg-white px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{formatNumber(value)}</p></div>;
}

function PriceApprovalCard({ order, expanded, onToggle, organizationId, onUpdated, onError }: { order: GroupedPurchaseOrder; expanded: boolean; onToggle: () => void; organizationId: string; onUpdated: () => Promise<void>; onError: (message: string) => void }) {
  const [lines, setLines] = useState<GroupedLine[]>(() => order.lines.map((line) => ({ ...line, groupedQty: String(line.groupedQty ?? ""), vendorPrice: String(line.vendorPrice ?? "") })));
  const [saving, setSaving] = useState(false);
  const updatePrice = (id: string, value: string) => setLines((current) => current.map((line) => line.id === id ? { ...line, vendorPrice: value } : line));
  const action = async (type: "save-prices" | "approve" | "reject") => {
    setSaving(true);
    try {
      const response = await fetch(`/api/orders/procurement/${encodeURIComponent(order.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: type, prices: lines.map((line) => ({ lineId: line.id, vendorPrice: line.vendorPrice })), reason: type === "reject" ? "Price requires correction." : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update price approval.");
      await onUpdated();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to update price approval.");
    } finally {
      setSaving(false);
    }
  };
  return <div className="erp-surface overflow-hidden"><button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"><span className="flex min-w-0 items-center gap-2">{expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}<span className="min-w-0"><span className="block text-xs font-bold text-slate-950">{order.groupedPoNo}</span><span className="block text-[10px] text-slate-500">{order.vendor.name} · {order.lines.length} lines · submitted {new Date(order.submittedAt).toLocaleDateString()}</span></span></span><span className="text-xs font-bold text-emerald-700">{formatNumber(order.lines.reduce((total, line) => total + Number(line.groupedQty ?? 0), 0))} qty</span></button>{expanded && <div className="border-t border-slate-200 p-4"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-[10px]"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Order / Style</th><th className="px-2 py-2">Brand</th><th className="px-2 py-2">Category</th><th className="px-2 py-2">Item</th><th className="px-2 py-2 text-right">Grouped Qty</th><th className="px-2 py-2 text-right">Vendor Price</th></tr></thead><tbody className="divide-y divide-slate-100">{lines.map((line) => <tr key={line.id}><td className="px-2 py-2 font-semibold text-slate-800">{text(line.orderNo)} / {text(line.styleName)}</td><td className="px-2 py-2">{text(line.brand)}</td><td className="px-2 py-2">{text(line.category)} / {text(line.subCategory)}</td><td className="px-2 py-2 font-semibold text-slate-900">{text(line.itemName)}</td><td className="px-2 py-2 text-right">{formatNumber(line.groupedQty ? Number(line.groupedQty) : 0)}</td><td className="px-2 py-2 text-right"><input type="number" min="0" step="0.01" value={line.vendorPrice} onChange={(event) => updatePrice(line.id, event.target.value)} className="w-28 rounded border border-slate-300 px-2 py-1 text-right outline-none focus:border-blue-500" /></td></tr>)}</tbody></table></div><div className="mt-3 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => action("save-prices")} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Save prices</button><button type="button" disabled={saving} onClick={() => action("approve")} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">Approve price</button><button type="button" disabled={saving} onClick={() => action("reject")} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60">Reject</button></div></div>}</div>;
}
