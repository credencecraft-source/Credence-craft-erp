"use client";

import { Check, ClipboardCheck, FilePlus2, Loader2, PackageSearch, Plus, Send } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

export type GeneralPurchaseOrderStage = "allocate-vendor" | "approve-price" | "create-po";

type MasterOption = { id: string; label: string; fields?: Record<string, unknown> };
type GeneralPurchaseOrderRequest = {
  id: string;
  status: string;
  rawMaterial: string;
  rawMaterialId: string;
  category: string | null;
  subCategory: string | null;
  stockUom: string;
  quantity: number;
  vendor: { id: string; name: string } | null;
  vendorPrice: number | null;
  gst: number | null;
  hsnCode: string | null;
  createdBy: string | null;
  createdAt: string;
  purchaseOrder: { id: string; number: string; status: string } | null;
};
type PriceDraft = { vendorId: string; vendorPrice: string; gstMasterId: string; hsnCode: string; quantity: string };
type CreatedPurchaseOrder = { id: string; number: string; status: string };
type MasterLookups = { materials: MasterOption[]; vendors: MasterOption[]; gst: MasterOption[]; hsn: MasterOption[] };

const stages: Array<{ key: GeneralPurchaseOrderStage; number: string; label: string; icon: typeof PackageSearch }> = [
  { key: "allocate-vendor", number: "01", label: "Request material", icon: PackageSearch },
  { key: "approve-price", number: "02", label: "Vendor & price", icon: ClipboardCheck },
  { key: "create-po", number: "03", label: "Create PO", icon: FilePlus2 },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: unknown };
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "The request could not be completed.");
  }
  return data;
}

function jsonPost(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function masterNumber(option: MasterOption) {
  const value = option.fields?.Gst ?? option.fields?.gst;
  return value === null || value === undefined ? "" : String(value);
}

function hydratePriceDrafts(
  current: Record<string, PriceDraft>,
  requests: GeneralPurchaseOrderRequest[],
  gstOptions: MasterOption[],
) {
  const next = { ...current };
  for (const request of requests) {
    const gstMasterId = gstOptions.find((option) => masterNumber(option) === String(request.gst ?? ""))?.id ?? "";
    if (!next[request.id]) {
      next[request.id] = {
        vendorId: request.vendor?.id ?? "",
        vendorPrice: request.vendorPrice === null ? "" : String(request.vendorPrice),
        gstMasterId,
        hsnCode: request.hsnCode ?? "",
        quantity: String(request.quantity),
      };
    } else if (!next[request.id].gstMasterId && request.gst !== null && gstMasterId) {
      next[request.id] = { ...next[request.id], gstMasterId };
    }
  }
  return next;
}

export default function GeneralPurchaseOrderStagePage({ stage }: { stage: GeneralPurchaseOrderStage }) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params.workspaceId;
  const organizationId = params.organizationId;
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;
  const basePath = `${procurementPath}/create-po/general-po`;
  const currentStage = stages.find((item) => item.key === stage) ?? stages[0];
  const [requests, setRequests] = useState<GeneralPurchaseOrderRequest[]>([]);
  const [materials, setMaterials] = useState<MasterOption[]>([]);
  const [vendors, setVendors] = useState<MasterOption[]>([]);
  const [gstOptions, setGstOptions] = useState<MasterOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<MasterOption[]>([]);
  const [requestLines, setRequestLines] = useState([{ rawMaterialId: "", quantity: "1" }]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, PriceDraft>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [poDate, setPoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [createdPurchaseOrder, setCreatedPurchaseOrder] = useState<CreatedPurchaseOrder | null>(null);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchRequests = useCallback(async (cursor?: string) => {
    const status = stage === "approve-price"
      ? "PENDING_PRICE_APPROVAL"
      : stage === "create-po"
        ? "PRICE_APPROVED,PO_CREATED"
        : "PENDING_PRICE_APPROVAL,PRICE_APPROVED,PO_CREATED";
    const query = new URLSearchParams({
      view: "general-po",
      organizationId,
      status,
      limit: "50",
    });
    if (cursor) query.set("cursor", cursor);
    return fetchJson<{ requests: GeneralPurchaseOrderRequest[]; nextCursor: string | null }>(
      `/api/orders/procurement?${query.toString()}`,
      { cache: "no-store" },
    );
  }, [organizationId, stage]);

  const fetchMasterOptions = useCallback(async (): Promise<MasterLookups> => {
    const load = (module: string, includeDummyData = false) => fetchJson<MasterOption[]>(
      `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${module}?includeInactive=false&limit=200${includeDummyData ? "&includeDummyData=true" : ""}`,
      { cache: "no-store" },
    );
    if (stage === "allocate-vendor") {
      return { materials: await load("raw-material"), vendors: [], gst: [], hsn: [] };
    }
    if (stage === "approve-price") {
      const [vendorOptions, gstMasters, hsnMasters] = await Promise.all([load("vendor", true), load("gst"), load("hsn")]);
      return { materials: [], vendors: vendorOptions, gst: gstMasters, hsn: hsnMasters };
    }
    return { materials: [], vendors: [], gst: [], hsn: [] };
  }, [organizationId, stage]);

  const refresh = useCallback(async () => {
    const page = await fetchRequests();
    setRequests(page.requests);
    setNextCursor(page.nextCursor);
    setPriceDrafts((current) => hydratePriceDrafts(current, page.requests, gstOptions));
  }, [fetchRequests, gstOptions]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchRequests(), fetchMasterOptions()])
      .then(([requestPage, lookups]) => {
        if (!active) return;
        setRequests(requestPage.requests);
        setNextCursor(requestPage.nextCursor);
        setMaterials(lookups.materials);
        setVendors(lookups.vendors);
        setGstOptions(lookups.gst);
        setHsnOptions(lookups.hsn);
        setPriceDrafts((current) => hydratePriceDrafts(current, requestPage.requests, lookups.gst));
        setError("");
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load General PO data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchMasterOptions, fetchRequests]);

  const loadMoreRequests = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await fetchRequests(nextCursor);
      setRequests((current) => [...current, ...page.requests]);
      setNextCursor(page.nextCursor);
      setPriceDrafts((current) => hydratePriceDrafts(current, page.requests, gstOptions));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more General PO requests.");
    } finally {
      setLoadingMore(false);
    }
  };

  const changeDraft = (requestId: string, field: keyof PriceDraft, value: string) => {
    setPriceDrafts((current) => ({
      ...current,
      [requestId]: { ...current[requestId], [field]: value },
    }));
  };

  const saveRequests = async () => {
    setBusy("save-requests");
    setError("");
    setNotice("");
    try {
      await fetchJson("/api/orders/procurement", jsonPost({
        organizationId,
        action: "create-general-requests",
        requests: requestLines.map((line) => ({ rawMaterialId: line.rawMaterialId, quantity: line.quantity })),
      }));
      setRequestLines([{ rawMaterialId: "", quantity: "1" }]);
      await refresh();
      setNotice("Raw-material requests saved. They are now ready for vendor pricing.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save raw-material requests.");
    } finally {
      setBusy("");
    }
  };

  const savePrice = async (request: GeneralPurchaseOrderRequest) => {
    const draft = priceDrafts[request.id];
    if (!draft) return;
    setBusy(`save:${request.id}`);
    setError("");
    setNotice("");
    try {
      await fetchJson("/api/orders/procurement", jsonPost({
        organizationId,
        action: "save-general-price",
        requestId: request.id,
        vendorId: draft.vendorId,
        vendorPrice: draft.vendorPrice,
        gstMasterId: draft.gstMasterId || null,
        hsnCode: draft.hsnCode || null,
        quantity: draft.quantity,
      }));
      await refresh();
      setNotice(`Vendor pricing saved for ${request.rawMaterial}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save vendor pricing.");
    } finally {
      setBusy("");
    }
  };

  const approvePrice = async (request: GeneralPurchaseOrderRequest) => {
    setBusy(`approve:${request.id}`);
    setError("");
    setNotice("");
    try {
      await fetchJson("/api/orders/procurement", jsonPost({
        organizationId,
        action: "approve-general-price",
        requestId: request.id,
      }));
      await refresh();
      setNotice(`Price approved for ${request.rawMaterial}.`);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Unable to approve vendor pricing.");
    } finally {
      setBusy("");
    }
  };

  const selectedVendorId = requests.find((request) => selectedIds.includes(request.id))?.vendor?.id ?? "";
  const selectableRequests = requests.filter((request) => request.status === "PRICE_APPROVED");
  const selectedVendorName = vendors.find((vendor) => vendor.id === selectedVendorId)?.label
    ?? selectableRequests.find((request) => request.vendor?.id === selectedVendorId)?.vendor?.name
    ?? "";

  const toggleRequest = (requestId: string) => {
    setSelectedIds((current) => {
      if (current.includes(requestId)) return current.filter((id) => id !== requestId);
      const request = selectableRequests.find((item) => item.id === requestId);
      const vendorId = current.length
        ? selectableRequests.find((item) => item.id === current[0])?.vendor?.id
        : request?.vendor?.id;
      if (!request || !request.vendor || request.vendor.id !== vendorId) return current;
      return [...current, requestId];
    });
  };

  const createPo = async () => {
    setBusy("create-po");
    setError("");
    setNotice("");
    try {
      const result = await fetchJson<{ purchaseOrder: { id: string; purchaseOrderNo: string; status: string } }>(
        "/api/orders/procurement",
        jsonPost({
          organizationId,
          action: "create-general-po",
          requestIds: selectedIds,
          poDate,
          deliveryDate: deliveryDate || null,
        }),
      );
      setCreatedPurchaseOrder({
        id: result.purchaseOrder.id,
        number: result.purchaseOrder.purchaseOrderNo,
        status: result.purchaseOrder.status,
      });
      setSelectedIds([]);
      await refresh();
      setNotice(`${result.purchaseOrder.purchaseOrderNo} created as a draft. Submit it for Purchase Order approval when ready.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the Purchase Order.");
    } finally {
      setBusy("");
    }
  };

  const submitForApproval = async (purchaseOrderId: string, purchaseOrderNumber: string) => {
    setBusy(`submit:${purchaseOrderId}`);
    setError("");
    setNotice("");
    try {
      await fetchJson(`/api/orders/purchase-orders/${encodeURIComponent(purchaseOrderId)}`, jsonPost({
        organizationId,
        action: "submit-approval",
      }));
      setCreatedPurchaseOrder((current) => current?.id === purchaseOrderId ? { ...current, status: "PENDING_APPROVAL" } : current);
      await refresh();
      setNotice(`${purchaseOrderNumber} submitted to the Purchase Order approval queue.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit the Purchase Order for approval.");
    } finally {
      setBusy("");
    }
  };

  const activePendingRequests = useMemo(
    () => requests.filter((request) => request.status === "PENDING_PRICE_APPROVAL"),
    [requests],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <nav className="grid gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 sm:grid-cols-3" aria-label="General PO stages">
        {stages.map((item) => (
          <Button
            key={item.key}
            onClick={() => router.push(`${basePath}/${item.key}`)}
            aria-current={item.key === stage ? "step" : undefined}
            variant="secondary"
            className={`h-auto min-h-10 justify-start gap-2 whitespace-normal rounded-md px-2.5 py-2 text-left ${item.key === stage ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-50" : "bg-slate-50 hover:border-emerald-300"}`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${item.key === stage ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}>{item.number}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-800">
              <item.icon className="h-3.5 w-3.5 shrink-0 text-emerald-700" />{item.label}
            </span>
          </Button>
        ))}
      </nav>

      <section className="erp-surface overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">General purchase order</p>
            <h1 className="mt-1 text-lg font-bold text-slate-950">{currentStage.label}</h1>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading General PO records…</div>
          ) : (
            <>
              {stage === "allocate-vendor" && (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Request raw materials</h2>
                  </div>
                  <div className="space-y-3">
                    {requestLines.map((line, index) => {
                      const selectedMaterial = materials.find((material) => material.id === line.rawMaterialId);
                      const stockUom = selectedMaterial?.fields?.Stock_Uom1;
                      return (
                      <div key={index} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
                        <Select
                          label={`Raw material ${index + 1}`}
                          value={line.rawMaterialId}
                          onChange={(event) => setRequestLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, rawMaterialId: event.target.value } : item))}
                          options={[{ value: "", label: "Select raw material" }, ...materials.map((material) => ({ value: material.id, label: material.label }))]}
                          required
                        />
                        <Input
                          label={`Required quantity${stockUom ? ` (${String(stockUom)})` : ""}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) => setRequestLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: event.target.value } : item))}
                          required
                        />
                        {requestLines.length > 1 && (
                          <Button variant="secondary" onClick={() => setRequestLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</Button>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button variant="secondary" onClick={() => setRequestLines((current) => [...current, { rawMaterialId: "", quantity: "1" }])}>
                      <Plus className="h-4 w-4" />Add material
                    </Button>
                    <Button onClick={saveRequests} disabled={busy === "save-requests" || materials.length === 0}>
                      {busy === "save-requests" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Save material request
                    </Button>
                  </div>
                  {materials.length === 0 && <EmptyState message="No active raw materials are available in the organization master data." />}
                  <RequestTable requests={requests} />
                  <LoadMoreButton hasMore={Boolean(nextCursor)} loading={loadingMore} onClick={loadMoreRequests} />
                </section>
              )}

              {stage === "approve-price" && (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Vendor price approval</h2>
                    <p className="mt-1 text-xs text-slate-500">Save each material’s vendor, unit price, tax details and quantity before approving it.</p>
                  </div>
                  {activePendingRequests.length === 0 ? (
                    <EmptyState message="No material requests are waiting for vendor pricing." />
                  ) : (
                    <div className="space-y-3">
                      {activePendingRequests.map((request) => {
                        const draft = priceDrafts[request.id] ?? {
                          vendorId: request.vendor?.id ?? "",
                          vendorPrice: request.vendorPrice === null ? "" : String(request.vendorPrice),
                          gstMasterId: "",
                          hsnCode: request.hsnCode ?? "",
                          quantity: String(request.quantity),
                        };
                        const gstValue = gstOptions.find((option) => option.id === draft.gstMasterId);
                        const isDirty = draft.vendorId !== (request.vendor?.id ?? "")
                          || draft.vendorPrice !== (request.vendorPrice === null ? "" : String(request.vendorPrice))
                          || (gstValue ? Number(masterNumber(gstValue)) : null) !== request.gst
                          || draft.hsnCode !== (request.hsnCode ?? "")
                          || Number(draft.quantity) !== request.quantity;
                        const hasSavedPrice = request.vendor !== null && request.vendorPrice !== null;
                        const isSaving = busy === `save:${request.id}`;
                        const isApproving = busy === `approve:${request.id}`;
                        return (
                          <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-bold text-slate-900">{request.rawMaterial}</h3>
                                <p className="mt-1 text-xs text-slate-500">{request.category} / {request.subCategory} · Requested {request.quantity} {request.stockUom}</p>
                              </div>
                              <StatusBadge status={request.status} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                              <Select
                                label="Vendor"
                                value={draft.vendorId}
                                onChange={(event) => changeDraft(request.id, "vendorId", event.target.value)}
                                options={[{ value: "", label: "Select vendor" }, ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.label }))]}
                                required
                              />
                              <Input label="Vendor price / unit" type="number" min="0" step="0.0001" value={draft.vendorPrice} onChange={(event) => changeDraft(request.id, "vendorPrice", event.target.value)} required />
                              <Select
                                label="GST"
                                value={draft.gstMasterId}
                                onChange={(event) => changeDraft(request.id, "gstMasterId", event.target.value)}
                                options={[{ value: "", label: "Select GST" }, ...gstOptions.map((option) => ({ value: option.id, label: `${option.label} (${masterNumber(option)}%)` }))]}
                                required
                              />
                              <Select
                                label="HSN code"
                                value={draft.hsnCode}
                                onChange={(event) => changeDraft(request.id, "hsnCode", event.target.value)}
                                options={[{ value: "", label: "Select HSN" }, ...hsnOptions.map((option) => ({ value: String(option.fields?.Hsn_Code ?? option.fields?.hsn_code ?? option.label), label: option.label }))]}
                                required
                              />
                              <Input label={`Quantity (${request.stockUom})`} type="number" min="0.01" step="0.01" value={draft.quantity} onChange={(event) => changeDraft(request.id, "quantity", event.target.value)} required />
                            </div>
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                              <Button variant="secondary" onClick={() => savePrice(request)} disabled={Boolean(busy) || !draft.vendorId || draft.vendorPrice.trim() === "" || !Number.isFinite(Number(draft.vendorPrice)) || !draft.gstMasterId || !draft.hsnCode}>
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save price details
                              </Button>
                              <Button onClick={() => approvePrice(request)} disabled={Boolean(busy) || !hasSavedPrice || isDirty}>
                                {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve price
                              </Button>
                            </div>
                            {isDirty && hasSavedPrice && <p className="mt-2 text-right text-xs text-amber-700">Save your changes before approving.</p>}
                          </article>
                        );
                      })}
                    </div>
                  )}
                  {vendors.length === 0 && activePendingRequests.length > 0 && <EmptyState message="No active vendors are available in the organization master data." />}
                  {(gstOptions.length === 0 || hsnOptions.length === 0) && activePendingRequests.length > 0 && <EmptyState message="Active GST and HSN master values are required before vendor pricing can be saved." />}
                  <LoadMoreButton hasMore={Boolean(nextCursor)} loading={loadingMore} onClick={loadMoreRequests} />
                </section>
              )}

              {stage === "create-po" && (
                <section className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Create Purchase Order from approved material requests</h2>
                    <p className="mt-1 text-xs text-slate-500">Requests for one vendor can be combined. Draft POs remain editable in the Purchase Order area until submitted for approval.</p>
                  </div>
                  {selectableRequests.length === 0 ? (
                    <EmptyState message="No price-approved material requests are ready for PO creation." />
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                          <thead className="bg-slate-50 uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Select</th><th className="px-3 py-3">Material</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3">GST / HSN</th></tr></thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {selectableRequests.map((request) => {
                              const selected = selectedIds.includes(request.id);
                              const differentVendor = Boolean(selectedVendorId && request.vendor?.id !== selectedVendorId);
                              return (
                                <tr key={request.id} className={selected ? "bg-emerald-50/70" : ""}>
                                  <td className="px-3 py-3"><Checkbox aria-label={`Select ${request.rawMaterial} for PO`} checked={selected} disabled={differentVendor} onChange={() => toggleRequest(request.id)} /></td>
                                  <td className="px-3 py-3"><span className="font-semibold text-slate-900">{request.rawMaterial}</span><span className="mt-1 block text-slate-500">{request.category} / {request.subCategory}</span></td>
                                  <td className="px-3 py-3 text-slate-700">{request.vendor?.name ?? "Vendor missing"}</td>
                                  <td className="px-3 py-3 text-right tabular-nums">{request.quantity} {request.stockUom}</td>
                                  <td className="px-3 py-3 text-right tabular-nums">{request.vendorPrice?.toFixed(4) ?? "—"}</td>
                                  <td className="px-3 py-3 text-slate-600">{request.gst ?? 0}% / {request.hsnCode ?? "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {selectedIds.length > 0 && (
                        <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:grid-cols-3">
                          <div className="flex items-center text-sm font-semibold text-slate-800">{selectedIds.length} request{selectedIds.length === 1 ? "" : "s"} · {selectedVendorName}</div>
                          <Input label="PO date" type="date" value={poDate} onChange={(event) => setPoDate(event.target.value)} required />
                          <Input label="Delivery date" type="date" min={poDate} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
                          <div className="sm:col-span-3 sm:flex sm:justify-end">
                            <Button onClick={createPo} disabled={busy === "create-po" || !poDate}>
                              {busy === "create-po" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}Create draft PO
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <CreatedPurchaseOrders
                    requests={requests.filter((request) => request.status === "PO_CREATED" && request.purchaseOrder)}
                    busy={busy}
                    currentPurchaseOrder={createdPurchaseOrder}
                    onSubmit={submitForApproval}
                  />
                  <LoadMoreButton hasMore={Boolean(nextCursor)} loading={loadingMore} onClick={loadMoreRequests} />
                </section>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function RequestTable({ requests }: { requests: GeneralPurchaseOrderRequest[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Saved requests</h3>
      {requests.length === 0 ? <EmptyState message="No material requests have been saved yet." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Material</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Purchase Order</th></tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {requests.map((request) => <tr key={request.id}>
                <td className="px-3 py-3 font-semibold text-slate-900">{request.rawMaterial}</td>
                <td className="px-3 py-3 tabular-nums">{request.quantity} {request.stockUom}</td>
                <td className="px-3 py-3">{request.vendor?.name ?? "Not assigned"}</td>
                <td className="px-3 py-3"><StatusBadge status={request.status} /></td>
                <td className="px-3 py-3">{request.purchaseOrder?.number ?? "—"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LoadMoreButton({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <Button variant="secondary" onClick={onClick} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

function CreatedPurchaseOrders({
  requests,
  busy,
  currentPurchaseOrder,
  onSubmit,
}: {
  requests: GeneralPurchaseOrderRequest[];
  busy: string;
  currentPurchaseOrder: CreatedPurchaseOrder | null;
  onSubmit: (id: string, number: string) => Promise<void>;
}) {
  const purchaseOrders = new Map<string, { id: string; number: string; status: string }>();
  for (const request of requests) {
    if (request.purchaseOrder) purchaseOrders.set(request.purchaseOrder.id, request.purchaseOrder);
  }
  if (currentPurchaseOrder) purchaseOrders.set(currentPurchaseOrder.id, currentPurchaseOrder);
  const rows = [...purchaseOrders.values()];
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Created General POs</h3>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((order) => (
          <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div><p className="text-sm font-bold text-slate-900">{order.number}</p><StatusBadge status={order.status} /></div>
            {["DRAFT", "OPEN", "REJECTED"].includes(order.status) && (
              <Button onClick={() => onSubmit(order.id, order.number)} disabled={Boolean(busy)}>
                {busy === `submit:${order.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Submit for approval
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (value) => value.toUpperCase());
  const color = status === "PRICE_APPROVED" || status === "APPROVED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "PENDING_APPROVAL" || status === "PENDING_PRICE_APPROVAL"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status === "REJECTED"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${color}`}>{label}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-xs text-slate-500">{message}</div>;
}
