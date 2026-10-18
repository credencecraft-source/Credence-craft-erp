"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";


type LookupOption = { id: string; label: string; fields?: Record<string, unknown> };
type BillLine = { id: string; itemName: string; size: string; quantity: string; purchasePrice: string; salesPrice: string; gstId: string; hsnCode: string };
type SavedRecord = { id: string; status: "SAVED" | "POSTED"; itemType: "FINISHED_GOODS" | "RAW_MATERIAL"; styleName: string; brandId: string; sizeGroupId: string; colorId: string; categoryId: string; subCategoryId: string; lines: BillLine[] };

export default function PurchaseRecordDetailPage({ workspaceId, organizationId, recordId }: { workspaceId: string; organizationId: string; recordId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get("mode") === "edit";
  const detailPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/purchase-bill/${encodeURIComponent(recordId)}`;
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/purchase-bill`;
  const [record, setRecord] = useState<SavedRecord | null>(null);
  const [originalRecord, setOriginalRecord] = useState<SavedRecord | null>(null);
  const [gsts, setGsts] = useState<LookupOption[]>([]);
  const [hsns, setHsns] = useState<LookupOption[]>([]);
  const [brands, setBrands] = useState<LookupOption[]>([]);
  const [sizeGroups, setSizeGroups] = useState<LookupOption[]>([]);
  const [colors, setColors] = useState<LookupOption[]>([]);
  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [subCategories, setSubCategories] = useState<LookupOption[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedRecordId, setLoadedRecordId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState("");
  const loading = loadedRecordId !== recordId;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill/records?recordId=${encodeURIComponent(recordId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.records)) {
          throw new Error(data.error || "Unable to load the saved purchase record.");
        }
        const loadedRecord = (data.records as SavedRecord[]).find((item) => item.id === recordId) ?? null;
        setRecord(loadedRecord);
        setOriginalRecord(loadedRecord);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Unable to load the saved purchase record.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedRecordId(recordId);
      });

    return () => controller.abort();
  }, [organizationId, recordId]);

  useEffect(() => {
    if (!isEditing || !record || record.status !== "SAVED") return;
    const controller = new AbortController();
    const lookupPath = `/api/organizations/${encodeURIComponent(organizationId)}/master-data`;
    const loadOptions = async (key: string) => {
      const response = await fetch(`${lookupPath}/${key}?includeInactive=false`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error(`Unable to load ${key} options.`);
      return data as LookupOption[];
    };

    void Promise.all([
      loadOptions("gst"),
      loadOptions("hsn"),
      loadOptions("brand"),
      loadOptions("size-group"),
      loadOptions("color"),
      loadOptions("category"),
      loadOptions("sub-category"),
    ])
      .then(([gstOptions, hsnOptions, brandOptions, sizeGroupOptions, colorOptions, categoryOptions, subCategoryOptions]) => {
        if (controller.signal.aborted) return;
        setGsts(gstOptions);
        setHsns(hsnOptions);
        setBrands(brandOptions);
        setSizeGroups(sizeGroupOptions);
        setColors(colorOptions);
        setCategories(categoryOptions);
        setSubCategories(subCategoryOptions);
        setLookupError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLookupError(error instanceof Error ? error.message : "Unable to load purchase record edit options.");
        }
      });

    return () => controller.abort();
  }, [isEditing, organizationId, record]);

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
        body: JSON.stringify({ ...record, recordId: record.id }),
      });
      const data = await response.json() as { record?: SavedRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "Unable to update purchase record.");
      setRecord(data.record);
      setOriginalRecord(data.record);
      setMessage("Record updated successfully.");
      router.replace(detailPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update purchase record.");
    } finally {
      setSaving(false);
    }
  };

  const labelFor = (options: LookupOption[], id: string) => options.find((option) => option.id === id)?.label ?? id ?? "-";
  const canEdit = record?.status === "SAVED";

  return (
    <Page as="div">
      <Section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Purchase record</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Record Details</h1></div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push(reportPath)}>Back to Purchase Bills</Button>
            {!isEditing && canEdit ? <Button type="button" onClick={() => router.push(`${detailPath}?mode=edit`)}>Edit</Button> : null}
            {isEditing && canEdit ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    setRecord(originalRecord);
                    setMessage("");
                    router.replace(detailPath);
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveChanges()} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {message && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{message}</p>}
        {lookupError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{lookupError}</p>}
        {loading || !record ? <Card><p className="text-sm text-slate-600">{loading ? "Loading record details..." : "Purchase record was not found."}</p></Card> : <Card className="space-y-5">
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-7"><ReadOnlyField label="Brand" value={labelFor(brands, record.brandId)} /><ReadOnlyField label="Product Category" value={labelFor(categories, record.categoryId)} /><ReadOnlyField label="Product Subcategory" value={labelFor(subCategories, record.subCategoryId)} /><ReadOnlyField label="Size Group" value={labelFor(sizeGroups, record.sizeGroupId)} /><ReadOnlyField label="Color" value={labelFor(colors, record.colorId)} /><ReadOnlyField label="Size" value={record.lines.map((line) => line.size).filter(Boolean).join(", ") || "-"} /><ReadOnlyField label="Style Name" value={record.styleName || record.lines[0]?.itemName || "-"} /></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Size / Material</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Purchase Price</th><th className="px-3 py-2">Sales Price</th><th className="px-3 py-2">GST</th><th className="px-3 py-2">HSN</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id} className="border-t border-slate-200"><td className="px-3 py-2 font-semibold">{line.size || line.itemName}</td><td className="px-3 py-2"><Input type="number" min="0" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} disabled={!isEditing || !canEdit} className="w-24 rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-2"><Input type="number" min="0" step="0.01" value={line.purchasePrice} onChange={(event) => updateLine(line.id, "purchasePrice", event.target.value)} disabled={!isEditing || !canEdit} className="w-28 rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-2"><Input type="number" min="0" step="0.01" value={line.salesPrice} onChange={(event) => updateLine(line.id, "salesPrice", event.target.value)} disabled={!isEditing || !canEdit} className="w-28 rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-2"><Select value={line.gstId} onChange={(event) => updateLine(line.id, "gstId", event.target.value)} disabled={!isEditing || !canEdit} className="w-24 rounded border border-slate-300 px-2 py-1.5"><option value="">GST</option>{gsts.map((gst) => <option key={gst.id} value={gst.id}>{String(gst.fields?.Gst ?? gst.fields?.gst ?? gst.label)}%</option>)}</Select></td><td className="px-3 py-2"><Select value={line.hsnCode} onChange={(event) => updateLine(line.id, "hsnCode", event.target.value)} disabled={!isEditing || !canEdit} className="w-28 rounded border border-slate-300 px-2 py-1.5"><option value="">HSN</option>{hsns.map((hsn) => <option key={hsn.id} value={hsn.label}>{hsn.label}</option>)}</Select></td></tr>)}</tbody></table></div>
        </Card>}
      </Section>
    </Page>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<Input value={value} readOnly className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-800" /></label>;
}
