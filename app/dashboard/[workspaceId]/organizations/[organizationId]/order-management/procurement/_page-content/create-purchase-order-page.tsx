"use client";

import { ArrowLeft, Check, ChevronRight, Eye, Filter, Loader2, PackageSearch, Search, Store, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type BomRow = {
  id: string;
  orderNo?: string | null;
  styleName?: string | null;
  brand?: string | null;
  buyer?: string | null;
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  mainLabel?: string | null;
  size?: string | null;
  consumption?: number | string | null;
  buyerConsumption?: number | string | null;
  buyerPrice?: number | string | null;
  internalConsumption?: number | string | null;
  internalPrice?: number | string | null;
  valuePerGarmentRm?: number | string | null;
  requiredQty?: number | string | null;
  orderQty?: number | string | null;
  itemWiseExcessPercentage?: number | string | null;
  itemWiseExcessQty?: number | string | null;
  totalRequiredQty?: number | string | null;
};

type MaterialGroup = {
  key: string;
  label: string;
  mainLabel: string;
  subCategory: string;
  category: string;
  rows: BomRow[];
};

type ReportColumn = { key: keyof BomRow; label: string };

const reportColumns: ReportColumn[] = [
  { key: "orderNo", label: "Order No" },
  { key: "styleName", label: "Style Name" },
  { key: "brand", label: "Brand" },
  { key: "buyer", label: "Buyer" },
  { key: "categoryType", label: "RM Type" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub Category" },
  { key: "rawMaterialName", label: "Raw Material" },
  { key: "size", label: "Size" },
  { key: "consumption", label: "Consumption" },
  { key: "buyerConsumption", label: "Buyer Consumption" },
  { key: "buyerPrice", label: "Buyer Price" },
  { key: "internalConsumption", label: "Internal Consumption" },
  { key: "internalPrice", label: "Internal Price" },
  { key: "valuePerGarmentRm", label: "Value / Garment" },
  { key: "requiredQty", label: "Required Qty" },
  { key: "orderQty", label: "Order Qty" },
  { key: "itemWiseExcessPercentage", label: "Excess %" },
  { key: "itemWiseExcessQty", label: "Excess Qty" },
  { key: "totalRequiredQty", label: "Total Required Qty" },
];

const formatNumber = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const text = (value: unknown, fallback = "-") => value === null || value === undefined || value === "" ? fallback : String(value);

export default function CreatePurchaseOrderPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [vendorLoading, setVendorLoading] = useState(true);

  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;

  useEffect(() => {
    let mounted = true;

    fetch(`/api/orders/bom?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (mounted) setBomRows(data?.bomItems ?? []); })
      .catch(() => { if (mounted) setBomRows([]); })
      .finally(() => { if (mounted) setLoading(false); });

    fetch(`/api/masters?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load vendor masters");
        }
        const data = await response.json() as { masters?: Array<{ module_key?: string; values?: Array<{ label?: string | null }> }> };
        const vendorModule = Array.isArray(data.masters)
          ? data.masters.find((module) => module?.module_key === "vendor")
          : undefined;
        const items = Array.isArray(vendorModule?.values)
          ? vendorModule.values.map((value) => String(value?.label ?? "").trim()).filter((value): value is string => Boolean(value))
          : [];
        if (mounted) setVendorOptions(Array.from(new Set(items)).sort((left, right) => left.localeCompare(right)));
      })
      .catch(() => { if (mounted) setVendorOptions([]); })
      .finally(() => { if (mounted) setVendorLoading(false); });

    return () => { mounted = false; };
  }, [organizationId]);

  const groups = useMemo<MaterialGroup[]>(() => {
    const grouped = new Map<string, MaterialGroup>();
    bomRows.forEach((row) => {
      const label = text(row.rawMaterialName, "Unclassified material");
      const subCategory = text(row.subCategory, "Uncategorised");
      const key = `${label.toLowerCase()}|${subCategory.toLowerCase()}`;
      const group = grouped.get(key) ?? { key, label, mainLabel: text(row.mainLabel, label), subCategory, category: text(row.category, "General"), rows: [] };
      group.rows.push(row);
      grouped.set(key, group);
    });
    return Array.from(grouped.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [bomRows]);

  const filteredGroups = groups.filter((group) => {
    const needle = search.trim().toLowerCase();
    return !needle || `${group.label} ${group.mainLabel} ${group.subCategory} ${group.category}`.toLowerCase().includes(needle);
  });
  const selectedGroup = groups.find((group) => group.key === selectedKey) ?? null;
  const stageTabs = [
    { number: "01", label: "Stage 1 - Allocate Vendor" },
    { number: "02", label: "Stage 2 - Approve Price" },
    { number: "03", label: "Stage 3 - Create PO" },
  ];

  return (
    <div className={selectedGroup ? "w-full space-y-3" : "mx-auto max-w-7xl space-y-3"}>
      <header className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <button type="button" onClick={() => router.push(procurementPath)} aria-label="Back to procurement" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Procurement</p><h1 className="truncate text-lg font-bold text-slate-950">Style Wise PO</h1></div>
        <div className="ml-auto hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" /> BOM report</div>
      </header>

      {!selectedGroup && <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          {stageTabs.map((stage, index) => (
            <div key={stage.number} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${index === 0 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${index === 0 ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}>{stage.number}</span>
              <span className="truncate text-[10px] font-semibold text-slate-700">{stage.label}</span>
            </div>
          ))}
        </div>
      </div>}

      {selectedGroup ? <MaterialReport key={selectedGroup.key} group={selectedGroup} onBack={() => setSelectedKey(null)} /> : <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-900">Raw material groups</h2><div className="relative w-full max-w-xs"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search materials" className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-emerald-500" /></div></div>
        {loading ? <div className="erp-surface flex min-h-40 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading BOM report</div> : filteredGroups.length === 0 ? <div className="erp-surface flex min-h-40 flex-col items-center justify-center text-center"><PackageSearch className="h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-700">No raw material groups found</p></div> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{filteredGroups.map((group) => <MaterialGroupCard key={group.key} group={group} onClick={() => setSelectedKey(group.key)} />)}</div>}
      </section>}
    </div>
  );
}

function MaterialGroupCard({ group, onClick }: { group: MaterialGroup; onClick: () => void }) {
  const orders = Array.from(new Set(group.rows.map((row) => text(row.orderNo))));
  const styles = Array.from(new Set(group.rows.map((row) => text(row.styleName, text(row.orderNo)))));
  const total = group.rows.reduce((sum, row) => sum + Number(row.totalRequiredQty ?? row.requiredQty ?? 0), 0);
  return <button type="button" onClick={onClick} className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-700">{group.category}</p><h3 className="mt-0.5 truncate text-sm font-bold text-slate-950">{group.label}</h3><p className="mt-0.5 truncate text-[10px] text-slate-500">{group.subCategory}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-600" /></div><div className="mt-2 grid grid-cols-2 gap-2 border-y border-slate-100 py-2"><div><p className="text-[9px] font-bold uppercase text-slate-500">Required</p><p className="text-sm font-bold text-slate-950">{formatNumber(total)}</p></div><div><p className="text-[9px] font-bold uppercase text-slate-500">Styles</p><p className="text-sm font-bold text-slate-950">{styles.length}</p></div></div><p className="mt-2 truncate text-[10px] text-slate-500">{orders.length} orders · {group.rows.length} BOM lines</p></button>;
}

function LegacyMaterialReport({ group, onBack }: { group: MaterialGroup; onBack: () => void }) {
  const [visibleKeys, setVisibleKeys] = useState<Set<keyof BomRow>>(new Set(reportColumns.map((column) => column.key)));
  const [showColumns, setShowColumns] = useState(false);
  const total = group.rows.reduce((sum, row) => sum + Number(row.totalRequiredQty ?? row.requiredQty ?? 0), 0);
  const visibleColumns = reportColumns.filter((column) => visibleKeys.has(column.key));
  const toggleColumn = (key: keyof BomRow) => setVisibleKeys((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  return <section className="space-y-1"><div className="flex items-center gap-2 border-b border-slate-200 pb-1"><button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-3.5 w-3.5" /> Materials</button><span className="text-slate-300">/</span><h2 className="truncate text-sm font-bold text-slate-950">{group.label}</h2><span className="ml-auto hidden text-[10px] text-slate-500 sm:inline">{group.rows.length} BOM lines · {formatNumber(total)} required</span></div><div className="erp-surface overflow-hidden"><div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{group.mainLabel}</p><p className="truncate text-[10px] text-slate-500">{group.category} · {group.subCategory}</p></div><div className="relative flex shrink-0 gap-1"><button type="button" onClick={() => setShowColumns((open) => !open)} className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-semibold ${showColumns ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-white text-slate-600"}`}><Eye className="h-3.5 w-3.5" /> View</button><button type="button" onClick={() => setShowColumns((open) => !open)} className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-600"><Filter className="h-3.5 w-3.5" /> Filter</button>{showColumns && <div className="absolute right-0 top-8 z-10 grid max-h-72 w-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">{reportColumns.map((column) => <label key={String(column.key)} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"><input type="checkbox" checked={visibleKeys.has(column.key)} onChange={() => toggleColumn(column.key)} className="rounded border-slate-300 text-emerald-600" />{column.label}</label>)}</div>}</div></div><div className="overflow-x-auto"><table className="w-full min-w-max text-left text-[10px]"><thead className="bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr>{visibleColumns.map((column) => <th key={String(column.key)} className="whitespace-nowrap border-b border-slate-200 px-2.5 py-2">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{group.rows.map((row) => <tr key={row.id} className="hover:bg-emerald-50/40">{visibleColumns.map((column) => <td key={String(column.key)} className="whitespace-nowrap px-2.5 py-2 text-slate-700">{text(row[column.key])}</td>)}</tr>)}</tbody></table></div></div></section>;
}

void LegacyMaterialReport;

function MaterialReport({ group, onBack }: { group: MaterialGroup; onBack: () => void }) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const [visibleKeys, setVisibleKeys] = useState<Set<keyof BomRow>>(new Set(reportColumns.map((column) => column.key)));
  const [showColumns, setShowColumns] = useState(false);
  const [selectedOrderNos, setSelectedOrderNos] = useState<Set<string>>(new Set());
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [vendor, setVendor] = useState("");
  const [allocatedVendor, setAllocatedVendor] = useState<string | null>(null);
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [vendorQuickCreate, setVendorQuickCreate] = useState("");
  const [vendorSubmitting, setVendorSubmitting] = useState(false);
  const organizationId = params?.organizationId ?? "demo-org";
  const visibleColumns = reportColumns.filter((column) => visibleKeys.has(column.key));
  const orderKey = (row: BomRow) => text(row.orderNo, "Unnumbered order");
  const orderNumbers = Array.from(new Set(group.rows.map(orderKey)));
  const selectedRequiredQty = group.rows.reduce((sum, row) => selectedOrderNos.has(orderKey(row)) ? sum + Number(row.totalRequiredQty ?? row.requiredQty ?? 0) : sum, 0);
  const toggleColumn = (key: keyof BomRow) => setVisibleKeys((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleOrder = (orderNo: string) => setSelectedOrderNos((current) => { const next = new Set(current); if (next.has(orderNo)) next.delete(orderNo); else next.add(orderNo); return next; });
  const toggleAllOrders = () => setSelectedOrderNos((current) => current.size === orderNumbers.length ? new Set() : new Set(orderNumbers));

  useEffect(() => {
    let mounted = true;
    fetch(`/api/masters?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load vendor master");
        const data = await response.json() as { masters?: Array<{ module_key?: string; values?: Array<{ label?: string | null }> }> };
        const vendorModule = Array.isArray(data.masters)
          ? data.masters.find((module) => module?.module_key === "vendor")
          : undefined;
        const values = Array.isArray(vendorModule?.values)
          ? vendorModule.values.map((item) => String(item?.label ?? "").trim()).filter((item): item is string => Boolean(item))
          : [];
        if (mounted) setVendorOptions(Array.from(new Set(values)).sort((left, right) => left.localeCompare(right)));
      })
      .catch(() => { if (mounted) setVendorOptions([]); })
      .finally(() => { if (mounted) setVendorLoading(false); });
    return () => { mounted = false; };
  }, [organizationId]);

  const handleCreateVendor = async () => {
    const name = vendorQuickCreate.trim();
    if (!name) return;

    setVendorSubmitting(true);
    try {
      const response = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          moduleKey: "vendor",
          label: name,
          fields: { vendor: name },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Unable to create vendor");
      }

      const payload = await response.json();
      const createdName = String(payload?.value?.label ?? name).trim();
      setVendorOptions((current) => Array.from(new Set([...current, createdName])).sort((left, right) => left.localeCompare(right)));
      setVendor(createdName);
      setVendorQuickCreate("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to create vendor.");
    } finally {
      setVendorSubmitting(false);
    }
  };

  return <section className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-3.5 w-3.5" /> Materials</button>
      <span className="text-slate-300">/</span>
      <h2 className="truncate text-sm font-bold text-slate-950">{group.label}</h2>
      <div className="ml-auto flex items-center gap-3">
        <div className="text-right"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Selected required qty</p><p className="text-lg font-bold leading-none text-emerald-700">{formatNumber(selectedRequiredQty)}</p></div>
        <button type="button" disabled={selectedOrderNos.size === 0} onClick={() => setShowVendorDialog(true)} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Store className="h-3.5 w-3.5" /> Allocate Vendor</button>
      </div>
    </div>
    {allocatedVendor && <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><Check className="h-4 w-4" /><span>Vendor allocated: <strong>{allocatedVendor}</strong> for {selectedOrderNos.size} order{selectedOrderNos.size === 1 ? "" : "s"}.</span></div>}
    <div className="erp-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{group.mainLabel}</p><p className="truncate text-[10px] text-slate-500">{group.category} - {group.subCategory} - {group.rows.length} BOM lines</p></div><div className="relative flex shrink-0 gap-1"><button type="button" onClick={() => setShowColumns((open) => !open)} className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-semibold ${showColumns ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-white text-slate-600"}`}><Eye className="h-3.5 w-3.5" /> View</button><button type="button" onClick={() => setShowColumns((open) => !open)} className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-600"><Filter className="h-3.5 w-3.5" /> Filter</button>{showColumns && <div className="absolute right-0 top-8 z-10 grid max-h-72 w-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">{reportColumns.map((column) => <label key={String(column.key)} className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"><input type="checkbox" checked={visibleKeys.has(column.key)} onChange={() => toggleColumn(column.key)} className="rounded border-slate-300 text-emerald-600" />{column.label}</label>)}</div>}</div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-max text-left text-[10px]"><thead className="bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="whitespace-nowrap border-b border-slate-200 px-2 py-2"><input type="checkbox" aria-label="Select all orders" checked={orderNumbers.length > 0 && selectedOrderNos.size === orderNumbers.length} onChange={toggleAllOrders} className="rounded border-slate-300 text-emerald-600" /></th>{visibleColumns.map((column) => <th key={String(column.key)} className="whitespace-nowrap border-b border-slate-200 px-2.5 py-2">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{group.rows.map((row) => <tr key={row.id} className={selectedOrderNos.has(orderKey(row)) ? "bg-emerald-50/60" : "hover:bg-emerald-50/40"}><td className="px-2 py-2"><input type="checkbox" aria-label={`Select order ${orderKey(row)}`} checked={selectedOrderNos.has(orderKey(row))} onChange={() => toggleOrder(orderKey(row))} className="rounded border-slate-300 text-emerald-600" /></td>{visibleColumns.map((column) => <td key={String(column.key)} className="whitespace-nowrap px-2.5 py-2 text-slate-700">{text(row[column.key])}</td>)}</tr>)}</tbody></table></div>
    </div>
    {showVendorDialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="allocate-vendor-title"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Stage 1 - Allocate Vendor</p><h3 id="allocate-vendor-title" className="mt-1 text-lg font-bold text-slate-950">Allocate selected orders</h3><p className="mt-1 text-xs text-slate-500">{selectedOrderNos.size} order{selectedOrderNos.size === 1 ? "" : "s"} selected - {formatNumber(selectedRequiredQty)} required quantity.</p></div><button type="button" onClick={() => setShowVendorDialog(false)} aria-label="Close vendor allocation" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-3"><label className="block text-xs font-bold text-slate-700">Select vendor<select value={vendor} onChange={(event) => setVendor(event.target.value)} disabled={vendorLoading} className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">{vendorLoading ? "Loading vendors..." : "Choose a vendor"}</option>{vendorOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Create new vendor</p><div className="mt-2 flex gap-2"><input value={vendorQuickCreate} onChange={(event) => setVendorQuickCreate(event.target.value)} placeholder="Enter vendor name" className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500" /><button type="button" onClick={handleCreateVendor} disabled={vendorSubmitting || !vendorQuickCreate.trim()} className="rounded-md bg-slate-900 px-3 py-2 text-[10px] font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">{vendorSubmitting ? "Saving..." : "Add"}</button></div></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowVendorDialog(false)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" disabled={!vendor} onClick={() => { setAllocatedVendor(vendor); setShowVendorDialog(false); }} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Check className="h-3.5 w-3.5" /> Allocate Vendor</button></div></div></div>}
  </section>;
}