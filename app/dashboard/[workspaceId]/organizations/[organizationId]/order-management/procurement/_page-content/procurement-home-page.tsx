"use client";

import { ArrowRight, ChevronDown, ChevronRight, ClipboardCheck, Loader2, PackageSearch, Plus, Search, ShieldCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type BomRow = { id: string; orderNo?: string | null; styleName?: string | null; brand?: string | null; category?: string | null; subCategory?: string | null; rawMaterialName?: string | null; internalConsumption?: number | string | null; requiredQty?: number | string | null; totalRequiredQty?: number | string | null };
type MaterialGroup = { key: string; rawMaterialName: string; category: string; subCategory: string; groupedQty: number; rows: BomRow[] };

const numberValue = (value: number | string | null | undefined) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
const formatNumber = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const text = (value: unknown, fallback = "-") => value === null || value === undefined || value === "" ? fallback : String(value);

export default function ProcurementHomePage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementBasePath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadBomRows() {
      try {
        const rows: BomRow[] = [];
        let cursor = "";
        do {
          const response = await fetch(`/api/orders/bom?organizationId=${encodeURIComponent(organizationId)}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || "Unable to load raw materials.");
          rows.push(...(data.bomItems ?? []));
          cursor = data.nextCursor ?? "";
        } while (cursor);
        if (mounted) setBomRows(rows);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load raw materials.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadBomRows();
    return () => { mounted = false; };
  }, [organizationId]);

  const groups = useMemo<MaterialGroup[]>(() => {
    const grouped = new Map<string, MaterialGroup>();
    for (const row of bomRows) {
      const rawMaterialName = text(row.rawMaterialName, "Unclassified material");
      const category = text(row.category, "General");
      const subCategory = text(row.subCategory, "Uncategorised");
      const key = `${rawMaterialName.toLowerCase()}|${category.toLowerCase()}|${subCategory.toLowerCase()}`;
      const group = grouped.get(key) ?? { key, rawMaterialName, category, subCategory, groupedQty: 0, rows: [] };
      group.groupedQty += numberValue(row.totalRequiredQty ?? row.requiredQty);
      group.rows.push(row);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((left, right) => left.rawMaterialName.localeCompare(right.rawMaterialName));
  }, [bomRows]);

  const filteredGroups = groups.filter((group) => { const needle = search.trim().toLowerCase(); return !needle || `${group.rawMaterialName} ${group.category} ${group.subCategory}`.toLowerCase().includes(needle); });
  const selectedGroup = groups.find((group) => group.key === selectedKey) ?? null;

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end"><div><p className="erp-eyebrow">Order Management / Procurement</p><h1 className="erp-page-heading mt-1">Raw material procurement</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Review every raw-material requirement by material group before allocating vendors.</p></div><button type="button" onClick={() => router.push(`${procurementBasePath}/create-po`)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"><Plus className="h-4 w-4" /> Style Wise PO</button></div>
    <div className="grid gap-2 sm:grid-cols-3"><StageIndicator number="01" label="Allocate vendor" active icon={PackageSearch} /><StageIndicator number="02" label="Approve price" icon={ClipboardCheck} /><StageIndicator number="03" label="Create PO" icon={ShieldCheck} /></div>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Material groups</p><h2 className="mt-1 text-sm font-bold text-slate-950">All raw materials</h2></div><div className="relative w-full max-w-xs"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search material or subcategory" className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-emerald-500" /></div></div>{error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}{loading ? <div className="erp-surface flex min-h-48 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading raw-material groups</div> : filteredGroups.length === 0 ? <div className="erp-surface flex min-h-48 items-center justify-center text-xs text-slate-500">No raw-material groups found.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredGroups.map((group) => <MaterialGroupCard key={group.key} group={group} selected={group.key === selectedKey} onClick={() => setSelectedKey(group.key === selectedKey ? null : group.key)} />)}</div>}</section>
    {selectedGroup && <RelatedOrders group={selectedGroup} onOpenStyleWisePo={() => router.push(`${procurementBasePath}/create-po`)} />}
  </div>;
}

function StageIndicator({ number, label, active, icon: Icon }: { number: string; label: string; active?: boolean; icon: typeof PackageSearch }) { return <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}>{number}</span><Icon className="h-3.5 w-3.5 text-slate-500" /><span className="text-xs font-semibold text-slate-700">{label}</span></div>; }

function MaterialGroupCard({ group, selected, onClick }: { group: MaterialGroup; selected: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`group w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md ${selected ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">{group.category}</p><h3 className="mt-1 truncate text-base font-bold text-slate-950">{group.rawMaterialName}</h3><p className="mt-1 truncate text-xs text-slate-500">{group.subCategory}</p></div>{selected ? <ChevronDown className="h-4 w-4 shrink-0 text-emerald-700" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}</div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3"><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Grouped Qty</p><p className="mt-1 text-xl font-bold text-slate-950">{formatNumber(group.groupedQty)}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Related Orders</p><p className="mt-1 text-xl font-bold text-slate-950">{new Set(group.rows.map((row) => row.orderNo)).size}</p></div></div><p className="mt-3 text-[10px] text-slate-500">{group.rows.length} raw-material line{group.rows.length === 1 ? "" : "s"}</p></button>; }

function RelatedOrders({ group, onOpenStyleWisePo }: { group: MaterialGroup; onOpenStyleWisePo: () => void }) { return <section className="erp-surface overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Selected material</p><h2 className="mt-1 text-sm font-bold text-slate-950">{group.rawMaterialName} · {group.subCategory}</h2></div><button type="button" onClick={onOpenStyleWisePo} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Allocate vendor <ArrowRight className="h-3.5 w-3.5" /></button></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-xs"><thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2.5">Order Name</th><th className="px-4 py-2.5">Style Name</th><th className="px-4 py-2.5">Brand</th><th className="px-4 py-2.5">Internal Consumption</th><th className="px-4 py-2.5 text-right">Required Qty</th></tr></thead><tbody className="divide-y divide-slate-100">{group.rows.map((row) => <tr key={row.id} className="hover:bg-emerald-50/40"><td className="px-4 py-2.5 font-semibold text-slate-800">{text(row.orderNo)}</td><td className="px-4 py-2.5 text-slate-700">{text(row.styleName)}</td><td className="px-4 py-2.5 text-slate-700">{text(row.brand)}</td><td className="px-4 py-2.5 text-slate-700">{formatNumber(numberValue(row.internalConsumption))}</td><td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatNumber(numberValue(row.totalRequiredQty ?? row.requiredQty))}</td></tr>)}</tbody></table></div></section>; }