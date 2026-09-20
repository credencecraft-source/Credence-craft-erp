"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type LookupOption = { id: string; label: string; fields?: Record<string, unknown> };
type BillLine = { id: string; itemName: string; size: string; quantity: string; purchasePrice: string; salesPrice: string; gstId: string; hsnCode: string };
type SavedRecord = { id: string; itemType: "FINISHED_GOODS" | "RAW_MATERIAL"; styleName: string; brandId: string; sizeGroupId: string; colorId: string; categoryId: string; subCategoryId: string; lines: BillLine[] };

export default function PurchaseRecordDetailPage({ workspaceId, organizationId, recordId }: { workspaceId: string; organizationId: string; recordId: string }) {
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}`;
  const [record, setRecord] = useState<SavedRecord | null>(null);
  const [gsts, setGsts] = useState<LookupOption[]>([]);
  const [hsns, setHsns] = useState<LookupOption[]>([]);
  const [brands, setBrands] = useState<LookupOption[]>([]);
  const [sizeGroups, setSizeGroups] = useState<LookupOption[]>([]);
  const [colors, setColors] = useState<LookupOption[]>([]);
  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [subCategories, setSubCategories] = useState<LookupOption[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/records`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/hsn?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/brand?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/size-group?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/color?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/category?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/sub-category?includeInactive=false`, { cache: "no-store" }).then((response) => response.json()),
    ]).then(([recordData, gstData, hsnData, brandData, sizeGroupData, colorData, categoryData, subCategoryData]) => {
      setRecord((recordData.records ?? []).find((item: SavedRecord) => item.id === recordId) ?? null);
      setGsts(Array.isArray(gstData) ? gstData : []);
      setHsns(Array.isArray(hsnData) ? hsnData : []);
      setBrands(Array.isArray(brandData) ? brandData : []);
      setSizeGroups(Array.isArray(sizeGroupData) ? sizeGroupData : []);
      setColors(Array.isArray(colorData) ? colorData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setSubCategories(Array.isArray(subCategoryData) ? subCategoryData : []);
    }).catch(() => setMessage("Unable to load the saved purchase record."));
  }, [organizationId, recordId]);

  const updateLine = (lineId: string, key: keyof BillLine, value: string) => {
    setRecord((current) => current ? { ...current, lines: current.lines.map((line) => line.id === lineId ? { ...line, [key]: value } : line) } : current);
  };

  const saveChanges = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/records`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      const data = await response.json() as { record?: SavedRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Unable to update purchase record.");
      setRecord(data.record);
      setMessage("Record updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update purchase record.");
    } finally {
      setSaving(false);
    }
  };

  const labelFor = (options: LookupOption[], id: string) => options.find((option) => option.id === id)?.label ?? id ?? "-";

  return (
    <Page as="div">
      <Section className="space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
          <Link href={`${base}/pos/purchase-bill/new`} className="text-xs font-semibold text-emerald-700">&larr; Saved records</Link>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Purchase record</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Record Details</h1></div>
        </div>
        {message && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{message}</p>}
        {!record ? <Card><p className="text-sm text-slate-600">Loading record details...</p></Card> : <Card className="space-y-5">
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-7"><ReadOnlyField label="Brand" value={labelFor(brands, record.brandId)} /><ReadOnlyField label="Product Category" value={labelFor(categories, record.categoryId)} /><ReadOnlyField label="Product Subcategory" value={labelFor(subCategories, record.subCategoryId)} /><ReadOnlyField label="Size Group" value={labelFor(sizeGroups, record.sizeGroupId)} /><ReadOnlyField label="Color" value={labelFor(colors, record.colorId)} /><ReadOnlyField label="Size" value={record.lines.map((line) => line.size).filter(Boolean).join(", ") || "-"} /><ReadOnlyField label="Style Name" value={record.styleName || record.lines[0]?.itemName || "-"} /></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Size / Material</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Purchase Price</th><th className="px-3 py-2">Sales Price</th><th className="px-3 py-2">GST</th><th className="px-3 py-2">HSN</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id} className="border-t border-slate-200"><td className="px-3 py-2 font-semibold">{line.size || line.itemName}</td><td className="px-3 py-2"><input type="number" min="0" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-2"><input type="number" min="0" step="0.01" value={line.purchasePrice} onChange={(event) => updateLine(line.id, "purchasePrice", event.target.value)} className="w-28 rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-2"><input type="number" min="0" step="0.01" value={line.salesPrice} onChange={(event) => updateLine(line.id, "salesPrice", event.target.value)} className="w-28 rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-2"><select value={line.gstId} onChange={(event) => updateLine(line.id, "gstId", event.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1.5"><option value="">GST</option>{gsts.map((gst) => <option key={gst.id} value={gst.id}>{String(gst.fields?.Gst ?? gst.fields?.gst ?? gst.label)}%</option>)}</select></td><td className="px-3 py-2"><select value={line.hsnCode} onChange={(event) => updateLine(line.id, "hsnCode", event.target.value)} className="w-28 rounded border border-slate-300 px-2 py-1.5"><option value="">HSN</option>{hsns.map((hsn) => <option key={hsn.id} value={hsn.label}>{hsn.label}</option>)}</select></td></tr>)}</tbody></table></div>
          <div className="flex justify-end"><Button onClick={saveChanges} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button></div>
        </Card>}
      </Section>
    </Page>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<input value={value} readOnly className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-800" /></label>;
}
