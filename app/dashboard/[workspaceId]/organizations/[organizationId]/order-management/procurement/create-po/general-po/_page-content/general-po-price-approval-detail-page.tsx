"use client";

import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

type MasterOption = { id: string; label: string; fields?: Record<string, unknown> };
type GeneralPoRequest = {
  id: string;
  status: string;
  entityName: string | null;
  rawMaterial: string;
  isAsset: boolean;
  category: string | null;
  subCategory: string | null;
  stockUom: string;
  quantity: number;
  vendor: { id: string; name: string } | null;
  vendorPrice: number | null;
  gst: number | null;
  hsnCode: string | null;
};
type PriceDraft = {
  vendorId: string;
  vendorPrice: string;
  gstMasterId: string;
  hsnCode: string;
  quantity: string;
};

async function readJson<T = Record<string, unknown>>(response: Response): Promise<T & { error?: string }> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

function optionGst(option: MasterOption) {
  return String(option.fields?.Gst ?? option.fields?.gst ?? "");
}

function optionHsn(option: MasterOption) {
  return String(option.fields?.Hsn_Code ?? option.fields?.hsn_code ?? option.label);
}

export default function GeneralPoPriceApprovalDetailPage({ assetMode = false }: { assetMode?: boolean }) {
  const params = useParams<{ workspaceId: string; organizationId: string; requestId: string }>();
  const router = useRouter();
  const { workspaceId, organizationId, requestId } = params;
  const basePath = assetMode
    ? `/dashboard/${workspaceId}/organizations/${organizationId}/asset-management/asset-po`
    : `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/create-po/general-po`;
  const [request, setRequest] = useState<GeneralPoRequest | null>(null);
  const [vendors, setVendors] = useState<MasterOption[]>([]);
  const [gstOptions, setGstOptions] = useState<MasterOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<MasterOption[]>([]);
  const [draft, setDraft] = useState<PriceDraft>({
    vendorId: "",
    vendorPrice: "",
    gstMasterId: "",
    hsnCode: "",
    quantity: "",
  });
  const [savedDraft, setSavedDraft] = useState<PriceDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupRetry, setLookupRetry] = useState(0);
  const [busy, setBusy] = useState<"save" | "approve" | "">("");
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");

  const existingGstMasterId = useMemo(
    () => gstOptions.find((option) => optionGst(option) === String(request?.gst ?? ""))?.id ?? "",
    [gstOptions, request?.gst],
  );
  const effectiveDraft = { ...draft, gstMasterId: draft.gstMasterId || existingGstMasterId };
  const effectiveSavedDraft = savedDraft
    ? { ...savedDraft, gstMasterId: savedDraft.gstMasterId || existingGstMasterId }
    : null;
  const isDirty = !effectiveSavedDraft || JSON.stringify(effectiveDraft) !== JSON.stringify(effectiveSavedDraft);
  const canSave = Boolean(
    effectiveDraft.vendorId
      && effectiveDraft.vendorPrice.trim()
      && Number.isFinite(Number(effectiveDraft.vendorPrice))
      && effectiveDraft.gstMasterId
      && effectiveDraft.hsnCode
      && Number.isFinite(Number(effectiveDraft.quantity))
      && Number(effectiveDraft.quantity) > 0,
  );

  const loadRequest = useCallback(async () => {
    const query = new URLSearchParams({
      view: "general-po-request",
      organizationId,
      requestId,
    });
    if (assetMode) query.set("isAsset", "true");
    const response = await fetch(`/api/orders/procurement?${query.toString()}`, { cache: "no-store" });
    const data = await readJson<{ request?: GeneralPoRequest }>(response);
    if (!data.request) throw new Error("The General PO price request was not found.");
    return data.request;
  }, [assetMode, organizationId, requestId]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => loadRequest())
      .then((record) => {
        if (!active) return;
        setRequest(record);
        const nextDraft: PriceDraft = {
          vendorId: record.vendor?.id ?? "",
          vendorPrice: record.vendorPrice === null ? "" : String(record.vendorPrice),
          gstMasterId: "",
          hsnCode: record.hsnCode ?? "",
          quantity: String(record.quantity),
        };
        setDraft(nextDraft);
        setSavedDraft(record.vendor && record.vendorPrice !== null && record.gst !== null && record.hsnCode
          ? {
              ...nextDraft,
              gstMasterId: "",
            }
          : null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load General PO price request.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const loadLookups = async () => {
      try {
        const [vendorResponse, gstResponse, hsnResponse] = await Promise.all([
          fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/vendor?includeInactive=false&includeDummyData=true&limit=200`, { cache: "no-store" }),
          fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false&limit=200`, { cache: "no-store" }),
          fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/hsn?includeInactive=false&limit=200`, { cache: "no-store" }),
        ]);
        const [vendorData, gstData, hsnData] = await Promise.all([
          readJson<MasterOption[]>(vendorResponse),
          readJson<MasterOption[]>(gstResponse),
          readJson<MasterOption[]>(hsnResponse),
        ]);
        if (!active) return;
        setVendors(vendorData);
        setGstOptions(gstData);
        setHsnOptions(hsnData);
      } catch (loadError: unknown) {
        if (active) setLookupError(loadError instanceof Error ? loadError.message : "Unable to load vendor, GST, and HSN masters.");
      } finally {
        if (active) setLookupsLoading(false);
      }
    };
    void Promise.resolve().then(loadLookups);

    return () => {
      active = false;
    };
  }, [loadRequest, lookupRetry, organizationId]);

  const savePrice = async () => {
    if (!request) return;
    setBusy("save");
    setError("");
    try {
      const response = await fetch("/api/orders/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "save-general-price",
          requestId: request.id,
          vendorId: effectiveDraft.vendorId,
          vendorPrice: effectiveDraft.vendorPrice,
          gstMasterId: effectiveDraft.gstMasterId,
          hsnCode: effectiveDraft.hsnCode,
          quantity: effectiveDraft.quantity,
        }),
      });
      await readJson(response);
      setSavedDraft({ ...effectiveDraft });
      const vendor = vendors.find((option) => option.id === draft.vendorId);
      const gstOption = gstOptions.find((option) => option.id === effectiveDraft.gstMasterId);
      const gst = gstOption ? Number(optionGst(gstOption)) : null;
      setRequest((current) => current ? {
        ...current,
        vendor: vendor ? { id: vendor.id, name: vendor.label } : current.vendor,
        vendorPrice: Number(effectiveDraft.vendorPrice),
        gst,
        hsnCode: effectiveDraft.hsnCode,
        quantity: Number(effectiveDraft.quantity),
      } : current);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save General PO price details.");
    } finally {
      setBusy("");
    }
  };

  const approvePrice = async () => {
    if (!request || !savedDraft || isDirty) return;
    setBusy("approve");
    setError("");
    try {
      const response = await fetch("/api/orders/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          action: "approve-general-price",
          requestId: request.id,
        }),
      });
      await readJson(response);
      router.push(`${basePath}/approve-price`);
    } catch (approveError: unknown) {
      setError(approveError instanceof Error ? approveError.message : "Unable to approve General PO price.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <Button type="button" variant="secondary" onClick={() => router.push(`${basePath}/approve-price`)}>
        <ArrowLeft className="h-4 w-4" />Back to Pending Approvals
      </Button>
      {loading ? (
        <section className="erp-surface flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />Loading {assetMode ? "Asset PO" : "General PO"} request…
        </section>
      ) : error && !request ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : request ? (
        <section className="erp-surface overflow-hidden">
          <header className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">{assetMode ? "Asset PO price approval" : "General PO price approval"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-950">{request.rawMaterial}</h1>
              {request.isAsset && <Badge>Asset Purchase</Badge>}
            </div>
            <p className="mt-1 text-xs text-slate-500">{request.category ?? "—"} / {request.subCategory ?? "—"} · {request.entityName ?? "Entity not assigned"}</p>
          </header>
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Asset classification</p>
                <p className="mt-1 text-xs text-slate-500">Controlled by the Raw Material Category. Asset and standard purchases are grouped into separate Purchase Orders.</p>
              </div>
              {request.isAsset ? <Badge>Asset Purchase</Badge> : <span className="text-sm text-slate-600">Standard Purchase</span>}
            </div>
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Requested quantity" value={`${request.quantity} ${request.stockUom}`} readOnly />
              <Input label="Status" value={request.status.replaceAll("_", " ")} readOnly />
              <Select
                label="Vendor"
                value={draft.vendorId}
                onChange={(event) => setDraft((current) => ({ ...current, vendorId: event.target.value }))}
                options={[{ value: "", label: lookupsLoading ? "Loading vendors…" : "Select vendor" }, ...vendors.map((option) => ({ value: option.id, label: option.label }))]}
                disabled={lookupsLoading || Boolean(lookupError)}
                required
              />
              <Input label="Vendor price / unit" type="number" min="0" step="0.0001" value={draft.vendorPrice} onChange={(event) => setDraft((current) => ({ ...current, vendorPrice: event.target.value }))} required />
              <Select
                label="GST"
                value={effectiveDraft.gstMasterId}
                onChange={(event) => setDraft((current) => ({ ...current, gstMasterId: event.target.value }))}
                options={[{ value: "", label: lookupsLoading ? "Loading GST…" : "Select GST" }, ...gstOptions.map((option) => ({ value: option.id, label: `${option.label} (${optionGst(option)}%)` }))]}
                disabled={lookupsLoading || Boolean(lookupError)}
                required
              />
              <Select
                label="HSN code"
                value={draft.hsnCode}
                onChange={(event) => setDraft((current) => ({ ...current, hsnCode: event.target.value }))}
                options={[{ value: "", label: lookupsLoading ? "Loading HSN…" : "Select HSN" }, ...hsnOptions.map((option) => ({ value: optionHsn(option), label: option.label }))]}
                disabled={lookupsLoading || Boolean(lookupError)}
                required
              />
              <Input label={`Purchase quantity (${request.stockUom})`} type="number" min="0.01" step="0.01" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} required />
            </div>
            {lookupError && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p role="alert">{lookupError}</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => {
                  setLookupsLoading(true);
                  setLookupError("");
                  setLookupRetry((current) => current + 1);
                }}>Retry master data</Button>
              </div>
            )}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={savePrice} disabled={Boolean(busy) || lookupsLoading || Boolean(lookupError) || !canSave}>
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save price details
              </Button>
              <Button type="button" onClick={approvePrice} disabled={Boolean(busy) || !savedDraft || isDirty || !request.vendor || request.vendorPrice === null || request.gst === null || !request.hsnCode}>
                {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve price
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
