"use client";

import { Check, ClipboardCheck, ExternalLink, FilePlus2, Loader2, PackageSearch, Plus, Shapes } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ReportGrid } from "@/components/reports/report-grid-display";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

export type GeneralPurchaseOrderStage = "allocate-vendor" | "approve-price" | "master-group" | "create-po";

type MasterOption = { id: string; label: string; fields?: Record<string, unknown> };
type GeneralPurchaseOrderRequest = {
  id: string;
  status: string;
  entityId: string | null;
  entityName: string | null;
  generalPurchaseOrderGroupId: string | null;
  rawMaterial: string;
  rawMaterialId: string;
  isAsset: boolean;
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
type GeneralPurchaseOrderGroup = {
  id: string;
  number: string;
  status: string;
  entityId: string;
  entityName: string;
  vendor: { id: string; name: string };
  rawMaterialId: string;
  rawMaterial: string;
  isAsset: boolean;
  category: string | null;
  subCategory: string | null;
  stockUom: string;
  quantity: number;
  vendorPrice: number;
  gst: number;
  hsnCode: string;
  requestCount: number;
  purchaseOrder: { id: string; number: string; status: string } | null;
};
type CreatedPurchaseOrder = { id: string; number: string };
type MasterLookups = {
  materials: MasterOption[];
  entities: MasterOption[];
  vendors: MasterOption[];
  gstRates: MasterOption[];
  hsnCodes: MasterOption[];
};
type GeneralPoDraftLine = { entityId: string; rawMaterialId: string; quantity: string; isAsset: boolean };
type GeneralPoDraftReportLine = GeneralPoDraftLine & { id: string };
type GeneralPoPriceDraft = {
  vendorId: string;
  vendorPrice: string;
  gstMasterId: string;
  hsnCode: string;
  quantity: string;
};
const generalPoDraftFields: Array<{ key: keyof GeneralPoDraftReportLine; label: string }> = [
  { key: "entityId", label: "Entity" },
  { key: "rawMaterialId", label: "Raw Material" },
  { key: "isAsset", label: "Asset Purchase" },
  { key: "quantity", label: "Required Quantity" },
];
type GeneralPoReportProps<T> = {
  title: string;
  records: T[];
  fields: Array<{ key: keyof T | string; label: string }>;
  storageKey: string;
  rowIdSelector: (record: T) => string;
  renderCell: (fieldKey: string, record: T) => React.ReactNode;
  selectedIds?: string[];
  selectable?: boolean;
  rowSelectable?: (record: T) => boolean;
  onRowClick?: (recordId: string) => void;
  onToggleSelectAll?: (checked: boolean, recordIds: string[]) => void;
  onToggleRowSelection?: (recordId: string, checked: boolean) => void;
  onNewOrder?: () => void;
  newActionLabel?: string;
  onRowAction?: (recordId: string) => void;
  rowActionLabel?: string;
  rowActions?: (record: T) => ReactNode;
  toolbarActions?: ReactNode;
  getSearchValue?: (fieldKey: string, record: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  compact?: boolean;
};

const stages: Array<{ key: GeneralPurchaseOrderStage; number: string; label: string; icon: typeof PackageSearch }> = [
  { key: "allocate-vendor", number: "01", label: "Request material", icon: PackageSearch },
  { key: "approve-price", number: "02", label: "Vendor & price", icon: ClipboardCheck },
  { key: "master-group", number: "03", label: "Master grouping", icon: Shapes },
  { key: "create-po", number: "04", label: "Create PO", icon: FilePlus2 },
];

function GeneralPoReport<T>({
  title,
  records,
  fields,
  storageKey,
  rowIdSelector,
  renderCell,
  selectedIds = [],
  selectable = false,
  rowSelectable,
  onRowClick,
  onToggleSelectAll,
  onToggleRowSelection,
  onNewOrder,
  newActionLabel,
  onRowAction,
  rowActionLabel,
  rowActions,
  toolbarActions,
  getSearchValue,
  isLoading,
  emptyMessage,
  compact = true,
}: GeneralPoReportProps<T>) {
  const [visibleFields, setVisibleFields] = useState<(keyof T | string)[]>(
    () => fields.map((field) => field.key),
  );
  return (
    <ReportGrid
      title={title}
      records={records}
      fields={fields}
      visibleFields={visibleFields}
      onVisibleFieldsChange={setVisibleFields}
      storageKey={storageKey}
      rowIdSelector={rowIdSelector}
      selectedIds={selectedIds}
      selectable={selectable}
      rowSelectable={rowSelectable}
      onRowClick={onRowClick}
      onToggleSelectAll={onToggleSelectAll}
      onToggleRowSelection={onToggleRowSelection}
      onNewOrder={onNewOrder}
      newActionLabel={newActionLabel}
      onRowAction={onRowAction}
      rowActionLabel={rowActionLabel}
      rowActions={rowActions}
      toolbarActions={toolbarActions}
      getSearchValue={getSearchValue}
      renderCell={renderCell}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      compact={compact}
    />
  );
}

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

function getMasterGst(option: MasterOption) {
  return String(option.fields?.Gst ?? option.fields?.gst ?? "");
}

function getMasterHsn(option: MasterOption) {
  return String(option.fields?.Hsn_Code ?? option.fields?.hsn_code ?? option.label);
}

function getMasterAsset(option?: MasterOption | null) {
  const value = option?.fields?.Asset_Purchase ?? option?.fields?.is_asset;
  return value === true || value === "true" || value === 1;
}

function AssetPurchaseBadge() {
  return <Badge>Asset Purchase</Badge>;
}

export default function GeneralPurchaseOrderStagePage({
  stage,
  assetMode = false,
}: {
  stage: GeneralPurchaseOrderStage;
  assetMode?: boolean;
}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params.workspaceId;
  const organizationId = params.organizationId;
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;
  const organizationPath = `/dashboard/${workspaceId}/organizations/${organizationId}`;
  const basePath = assetMode
    ? `${organizationPath}/asset-management/asset-po`
    : `${procurementPath}/create-po/general-po`;
  const documentLabel = assetMode ? "Asset PO" : "General PO";
  const currentStage = stages.find((item) => item.key === stage) ?? stages[0];
  const [requests, setRequests] = useState<GeneralPurchaseOrderRequest[]>([]);
  const [materials, setMaterials] = useState<MasterOption[]>([]);
  const [vendors, setVendors] = useState<MasterOption[]>([]);
  const [gstRates, setGstRates] = useState<MasterOption[]>([]);
  const [hsnCodes, setHsnCodes] = useState<MasterOption[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, GeneralPoPriceDraft>>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});
  const [selectedMaterialOptions, setSelectedMaterialOptions] = useState<Record<string, MasterOption>>({});
  const [entities, setEntities] = useState<MasterOption[]>([]);
  const [groupEntityId, setGroupEntityId] = useState("");
  const [requestLines, setRequestLines] = useState<GeneralPoDraftLine[]>(() => [
    { entityId: "", rawMaterialId: "", quantity: "1", isAsset: assetMode },
  ]);
  const [generalGroups, setGeneralGroups] = useState<GeneralPurchaseOrderGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [poDate, setPoDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [createdPurchaseOrder, setCreatedPurchaseOrder] = useState<CreatedPurchaseOrder | null>(null);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedStage, setLoadedStage] = useState<GeneralPurchaseOrderStage | null>(null);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [loadedLookupStage, setLoadedLookupStage] = useState<GeneralPurchaseOrderStage | null>(null);
  const [lookupsError, setLookupsError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestsLoading = stage !== "allocate-vendor" && (loading || loadedStage !== stage);
  const masterOptionsLoading = lookupsLoading || loadedLookupStage !== stage;
  const availableMaterials = useMemo(() => {
    const options = new Map<string, MasterOption>();
    for (const material of [...materials, ...Object.values(selectedMaterialOptions)]) {
      options.set(material.id, material);
    }
    return [...options.values()].filter((material) => !assetMode || getMasterAsset(material));
  }, [assetMode, materials, selectedMaterialOptions]);

  const fetchRequests = useCallback(async (cursor?: string) => {
    const status = stage === "approve-price"
      ? "PENDING_PRICE_APPROVAL"
      : stage === "master-group"
        ? "PRICE_APPROVED"
        : stage === "create-po"
          ? "PO_CREATED"
        : "PENDING_PRICE_APPROVAL,PRICE_APPROVED,PO_CREATED";
    const query = new URLSearchParams({
      view: "general-po",
      organizationId,
      status,
      limit: "50",
    });
    if (assetMode) query.set("isAsset", "true");
    if (stage === "master-group") query.set("unGroupedOnly", "true");
    if (cursor) query.set("cursor", cursor);
    return fetchJson<{ requests: GeneralPurchaseOrderRequest[]; nextCursor: string | null }>(
      `/api/orders/procurement?${query.toString()}`,
      { cache: "no-store" },
    );
  }, [assetMode, organizationId, stage]);

  const fetchMasterOptions = useCallback(async (signal?: AbortSignal): Promise<MasterLookups> => {
    const load = (module: string, includeDummyData = false) => fetchJson<MasterOption[]>(
      `/api/organizations/${encodeURIComponent(organizationId)}/master-data/${module}?includeInactive=false&limit=200${includeDummyData ? "&includeDummyData=true" : ""}`,
      { cache: "no-store", ...(signal ? { signal } : {}) },
    );
    if (stage === "allocate-vendor") {
      const [materialOptions, entityOptions] = await Promise.all([load("raw-material"), load("entity")]);
      return { materials: materialOptions, entities: entityOptions, vendors: [], gstRates: [], hsnCodes: [] };
    }
    if (stage === "approve-price") {
      const [vendorOptions, gstOptions, hsnOptions] = await Promise.all([
        load("vendor", true),
        load("gst"),
        load("hsn"),
      ]);
      return {
        materials: [],
        entities: [],
        vendors: vendorOptions,
        gstRates: gstOptions,
        hsnCodes: hsnOptions,
      };
    }
    if (stage === "master-group") {
      const entityOptions = await load("entity");
      return { materials: [], entities: entityOptions, vendors: [], gstRates: [], hsnCodes: [] };
    }
    return { materials: [], entities: [], vendors: [], gstRates: [], hsnCodes: [] };
  }, [organizationId, stage]);

  const loadMasterOptions = useCallback(async (signal?: AbortSignal) => {
    setLookupsLoading(true);
    setLookupsError("");
    try {
      const lookups = await fetchMasterOptions(signal);
      if (signal?.aborted) return;
      setMaterials(lookups.materials);
      setEntities(lookups.entities);
      setVendors(lookups.vendors);
      setGstRates(lookups.gstRates);
      setHsnCodes(lookups.hsnCodes);
    } catch (loadError) {
      if (!signal?.aborted) {
        setLookupsError(loadError instanceof Error ? loadError.message : "Unable to load General PO master data.");
      }
    } finally {
      if (!signal?.aborted) {
        setLoadedLookupStage(stage);
        setLookupsLoading(false);
      }
    }
  }, [fetchMasterOptions, stage]);

  const refresh = useCallback(async () => {
    const page = await fetchRequests();
    setRequests(page.requests);
    setNextCursor(page.nextCursor);
  }, [fetchRequests]);

  const refreshGroups = useCallback(async () => {
    const query = new URLSearchParams({
      view: "general-groups",
      organizationId,
      status: stage === "create-po" ? "MASTER_GROUPED" : "MASTER_GROUPED,PO_CREATED",
      limit: "50",
    });
    if (assetMode) query.set("isAsset", "true");
    const page = await fetchJson<{ groups: GeneralPurchaseOrderGroup[]; nextCursor: string | null }>(
      `/api/orders/procurement?${query.toString()}`,
      { cache: "no-store" },
    );
    setGeneralGroups(page.groups);
  }, [assetMode, organizationId, stage]);

  useEffect(() => {
    let active = true;
    const lookupController = new AbortController();
    if (stage !== "allocate-vendor") {
      fetchRequests()
        .then((requestPage) => {
          if (!active) return;
          setRequests(requestPage.requests);
          setNextCursor(requestPage.nextCursor);
          setError("");
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load General PO data.");
        })
        .finally(() => {
          if (active) {
            setLoadedStage(stage);
            setLoading(false);
          }
        });
    }
    if (stage === "create-po") {
      void Promise.resolve().then(() => refreshGroups()).catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load General PO Master Groups.");
      });
    }
    void Promise.resolve().then(() => loadMasterOptions(lookupController.signal));
    return () => {
      active = false;
      lookupController.abort();
    };
  }, [fetchRequests, loadMasterOptions, refreshGroups, stage]);

  const loadMoreRequests = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await fetchRequests(nextCursor);
      setRequests((current) => [...current, ...page.requests]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more General PO requests.");
    } finally {
      setLoadingMore(false);
    }
  };

  const saveRequests = async () => {
    setBusy("save-requests");
    setError("");
    setNotice("");
    try {
      await fetchJson("/api/orders/procurement", jsonPost({
        organizationId,
        action: "create-general-requests",
        requests: requestLines.map((line) => ({
          entityId: line.entityId,
          rawMaterialId: line.rawMaterialId,
          quantity: line.quantity,
          isAsset: assetMode || line.isAsset,
        })),
      }));
      const assetUpdates = new Map(requestLines.map((line) => [line.rawMaterialId, line.isAsset]));
      setMaterials((current) => current.map((material) => {
        const isAsset = assetUpdates.get(material.id);
        return isAsset === undefined
          ? material
          : { ...material, fields: { ...material.fields, Asset_Purchase: isAsset, is_asset: isAsset } };
      }));
      setRequestLines([{ entityId: "", rawMaterialId: "", quantity: "1", isAsset: assetMode }]);
      setSelectedMaterialOptions({});
      setNotice(`${assetMode ? "Asset" : "Raw-material"} requests saved. They are now ready for vendor and price review.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save raw-material requests.");
    } finally {
      setBusy("");
    }
  };

  const createGroups = async () => {
    if (new Set(pendingGroupingRequests.filter((request) => selectedIds.includes(request.id)).map((request) => request.isAsset)).size > 1) {
      setError("Asset and non-asset requests must be grouped separately.");
      return;
    }
    setBusy("create-groups");
    setError("");
    setNotice("");
    try {
      await fetchJson("/api/orders/procurement", jsonPost({
        organizationId,
        action: "create-general-master-groups",
        requestIds: selectedIds,
        entityId: groupEntityId || null,
      }));
      setSelectedIds([]);
      await refresh();
      setNotice("Compatible approved requests were grouped by Entity, asset classification, vendor, material, price and tax details.");
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : "Unable to create General PO Master Groups.");
    } finally {
      setBusy("");
    }
  };

  const toggleRequestSelection = (requestId: string, checked: boolean) => {
    const request = pendingGroupingRequests.find((item) => item.id === requestId);
    if (!request) return;
    if (!checked) {
      setSelectedIds((current) => current.filter((id) => id !== requestId));
      setError("");
      return;
    }
    const selected = pendingGroupingRequests.filter((item) => selectedIds.includes(item.id));
    if (selected.length && selected.some((item) => item.isAsset !== request.isAsset)) {
      setError("Asset and non-asset requests must be grouped separately.");
      return;
    }
    setError("");
    setSelectedIds((current) => [...new Set([...current, requestId])]);
  };

  const toggleAllRequestSelection = (checked: boolean, ids: string[]) => {
    if (!checked) {
      setSelectedIds([]);
      setError("");
      return;
    }
    const candidates = pendingGroupingRequests.filter((request) => ids.includes(request.id));
    const selected = pendingGroupingRequests.filter((request) => selectedIds.includes(request.id));
    const assetClass = selected[0]?.isAsset;
    const compatible = candidates.filter((request) => assetClass === undefined || request.isAsset === assetClass);
    if (!selected.length && new Set(candidates.map((request) => request.isAsset)).size > 1) {
      setSelectedIds([]);
      setError("Asset and non-asset requests must be grouped separately. Select one classification at a time.");
      return;
    }
    setError("");
    setSelectedIds(compatible.map((request) => request.id));
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((current) => {
      if (current.includes(groupId)) {
        setError("");
        return current.filter((id) => id !== groupId);
      }
      const group = generalGroups.find((item) => item.id === groupId);
      if (!group || group.status !== "MASTER_GROUPED") return current;
      if (current.length && selectedGroups.some((item) => item.isAsset !== group.isAsset)) {
        setError("Asset and non-asset Master Groups must be used in separate Purchase Orders.");
        return current;
      }
      if (current.length && (group.vendor.id !== selectedGroupVendorId || group.entityId !== selectedGroupEntityId)) {
        return current;
      }
      setError("");
      return [...current, groupId];
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
          groupIds: selectedGroupIds,
          poDate,
          deliveryDate: deliveryDate || null,
        }),
      );
      setCreatedPurchaseOrder({
        id: result.purchaseOrder.id,
        number: result.purchaseOrder.purchaseOrderNo,
      });
      setSelectedGroupIds([]);
      await refresh();
      await refreshGroups();
      setNotice(`${result.purchaseOrder.purchaseOrderNo} created as a draft.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the Purchase Order.");
    } finally {
      setBusy("");
    }
  };

  const getInlinePriceDraft = (request: GeneralPurchaseOrderRequest): GeneralPoPriceDraft =>
    priceDrafts[request.id] ?? {
      vendorId: request.vendor?.id ?? "",
      vendorPrice: request.vendorPrice === null ? "" : String(request.vendorPrice),
      gstMasterId: gstRates.find((option) => getMasterGst(option) === String(request.gst ?? ""))?.id ?? "",
      hsnCode: request.hsnCode ?? "",
      quantity: String(request.quantity),
    };

  const updateInlinePriceDraft = (
    request: GeneralPurchaseOrderRequest,
    field: keyof GeneralPoPriceDraft,
    value: string,
  ) => {
    const currentDraft = getInlinePriceDraft(request);
    setPriceDrafts((current) => ({
      ...current,
      [request.id]: { ...currentDraft, [field]: value },
    }));
    setPriceErrors((current) => ({ ...current, [request.id]: "" }));
  };

  const saveInlinePrice = async (request: GeneralPurchaseOrderRequest) => {
    const draft = getInlinePriceDraft(request);
    const gstOption = gstRates.find((option) => option.id === draft.gstMasterId);
    const vendorPrice = Number(draft.vendorPrice);
    const quantity = Number(draft.quantity);
    if (
      !draft.vendorId
      || !draft.vendorPrice.trim()
      || !Number.isFinite(vendorPrice)
      || vendorPrice < 0
      || !gstOption
      || !draft.hsnCode
      || !Number.isFinite(quantity)
      || quantity <= 0
    ) {
      setPriceErrors((current) => ({
        ...current,
        [request.id]: "Enter vendor, price, GST, HSN, and a valid quantity before saving.",
      }));
      return;
    }

    setBusy(`save-general-price:${request.id}`);
    setPriceErrors((current) => ({ ...current, [request.id]: "" }));
    try {
      await fetchJson("/api/orders/procurement", jsonPost({
        organizationId,
        action: "save-general-price",
        requestId: request.id,
        vendorId: draft.vendorId,
        vendorPrice: draft.vendorPrice,
        gstMasterId: draft.gstMasterId,
        hsnCode: draft.hsnCode,
        quantity: draft.quantity,
      }));
      const vendor = vendors.find((option) => option.id === draft.vendorId);
      setRequests((current) => current.map((item) => item.id === request.id ? {
        ...item,
        vendor: vendor ? { id: vendor.id, name: vendor.label } : item.vendor,
        vendorPrice,
        gst: Number(getMasterGst(gstOption)),
        hsnCode: draft.hsnCode,
        quantity,
      } : item));
      setPriceDrafts((current) => ({ ...current, [request.id]: draft }));
    } catch (saveError: unknown) {
      setPriceErrors((current) => ({
        ...current,
        [request.id]: saveError instanceof Error ? saveError.message : "Unable to save price details.",
      }));
    } finally {
      setBusy("");
    }
  };

  const approveInlinePrice = async (request: GeneralPurchaseOrderRequest) => {
    setBusy(`approve-general-price:${request.id}`);
    setPriceErrors((current) => ({ ...current, [request.id]: "" }));
    try {
      await fetchJson("/api/orders/procurement", jsonPost({
        organizationId,
        action: "approve-general-price",
        requestId: request.id,
      }));
      setRequests((current) => current.map((item) => item.id === request.id
        ? { ...item, status: "PRICE_APPROVED" }
        : item));
      setNotice(`${request.rawMaterial} price approved.`);
    } catch (approveError: unknown) {
      setPriceErrors((current) => ({
        ...current,
        [request.id]: approveError instanceof Error ? approveError.message : "Unable to approve price.",
      }));
    } finally {
      setBusy("");
    }
  };

  const activePendingRequests = useMemo(
    () => requests.filter((request) => request.status === "PENDING_PRICE_APPROVAL"),
    [requests],
  );
  const pendingGroupingRequests = useMemo(
    () => requests.filter((request) => request.status === "PRICE_APPROVED"
      && !request.generalPurchaseOrderGroupId
      && !request.purchaseOrder),
    [requests],
  );
  const selectedGroups = generalGroups.filter((group) => selectedGroupIds.includes(group.id));
  const selectedGroupVendorId = selectedGroups[0]?.vendor.id ?? "";
  const selectedGroupEntityId = selectedGroups[0]?.entityId ?? "";
  const hasMixedGroupAssets = new Set(selectedGroups.map((group) => group.isAsset)).size > 1;
  const hasMixedRequestEntities = new Set(requestLines.filter((line) => line.entityId).map((line) => line.entityId)).size > 1;
  const hasMixedSelectedRequestAssets = new Set(
    pendingGroupingRequests.filter((request) => selectedIds.includes(request.id)).map((request) => request.isAsset),
  ).size > 1;

  return (
    <div className="w-full min-w-0 max-w-none space-y-2">
      <nav className="grid gap-1 rounded-lg border border-slate-200 bg-white p-1 sm:grid-cols-4" aria-label={`${documentLabel} stages`}>
        {stages.map((item) => (
          <Button
            key={item.key}
            onClick={() => router.push(`${basePath}/${item.key}`)}
            aria-current={item.key === stage ? "step" : undefined}
            variant="secondary"
            className={`h-auto min-h-9 justify-start gap-2 whitespace-normal rounded-md px-2 py-1.5 text-left ${item.key === stage ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-50" : "bg-slate-50 hover:border-emerald-300"}`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${item.key === stage ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}>{item.number}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-800">
              <item.icon className="h-3.5 w-3.5 shrink-0 text-emerald-700" />{item.label}
            </span>
          </Button>
        ))}
      </nav>

      <section className="erp-surface overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">{assetMode ? "Asset purchase order" : "General purchase order"}</p>
            <h1 className="mt-1 text-lg font-bold text-slate-950">{currentStage.label}</h1>
          </div>
        </div>

        <div className="space-y-2 p-3">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {lookupsError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p role="alert">{lookupsError}</p>
              <Button type="button" variant="secondary" size="sm" disabled={masterOptionsLoading} onClick={() => void loadMasterOptions()}>
                {masterOptionsLoading ? "Loading masters…" : "Retry master data"}
              </Button>
            </div>
          )}
          {notice && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>{notice}</span>
              {stage === "create-po" && createdPurchaseOrder && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`${procurementPath}/purchase-order/${encodeURIComponent(createdPurchaseOrder.id)}`)}
                >
                  <ExternalLink className="h-4 w-4" />Open Purchase Order
                </Button>
              )}
            </div>
          )}
          {requestsLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading {documentLabel} records…</div>
          ) : (
            <>
              {stage === "allocate-vendor" && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Request raw materials</h2>
                    <p className="mt-1 text-xs text-slate-500">Choose an Entity and the organization’s active raw-material master records.</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <Button type="button" variant="secondary" onClick={() => window.open(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/raw-material/create`, "_blank", "noopener,noreferrer")}>
                      <Plus className="h-4 w-4" />Create raw material
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void loadMasterOptions()} disabled={masterOptionsLoading}>
                      {masterOptionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}Refresh masters
                    </Button>
                  </div>
                  <GeneralPoReport
                    title="Material request lines"
                    records={requestLines.map((line, index) => ({ ...line, id: String(index) }))}
                    fields={generalPoDraftFields}
                    storageKey={`${assetMode ? "asset-po" : "general-po"}-request-lines:${organizationId}`}
                    rowIdSelector={(line) => line.id}
                    onNewOrder={() => setRequestLines((current) => [
                      ...current,
                      { entityId: current[0]?.entityId ?? "", rawMaterialId: "", quantity: "1", isAsset: assetMode },
                    ])}
                    newActionLabel="Add material"
                    rowActions={(line) => (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          const lineIndex = Number(line.id);
                          setRequestLines((current) => current.filter((_, index) => index !== lineIndex));
                        }}
                      >
                        Remove
                      </Button>
                    )}
                    toolbarActions={(
                      <Button onClick={saveRequests} disabled={busy === "save-requests" || masterOptionsLoading || Boolean(lookupsError) || availableMaterials.length === 0 || requestLines.length === 0 || requestLines.some((line) => !line.entityId || !line.rawMaterialId) || hasMixedRequestEntities}>
                        {busy === "save-requests" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save requests
                      </Button>
                    )}
                    getSearchValue={(fieldKey, line) => fieldKey === "rawMaterialId"
                      ? availableMaterials.find((material) => material.id === line.rawMaterialId)?.label ?? ""
                      : line.quantity}
                    renderCell={(fieldKey, line) => {
                      const index = Number(line.id);
                      const selectedMaterial = availableMaterials.find((material) => material.id === line.rawMaterialId);
                      const stockUom = selectedMaterial?.fields?.Stock_Uom1;
                      if (fieldKey === "entityId") {
                        return (
                          <Select
                            aria-label={`Entity for material request ${index + 1}`}
                            value={line.entityId}
                            onChange={(event) => setRequestLines((current) => current.map((item, lineIndex) => lineIndex === index
                              ? { ...item, entityId: event.target.value }
                              : item))}
                            options={[
                              { value: "", label: masterOptionsLoading ? "Loading entities…" : "Select Entity" },
                              ...entities.map((entity) => ({ value: entity.id, label: entity.label })),
                            ]}
                            disabled={masterOptionsLoading || Boolean(lookupsError)}
                            required
                          />
                        );
                      }
                      if (fieldKey === "rawMaterialId") {
                        return (
                          <Select
                            aria-label={`Raw material ${index + 1}`}
                            value={line.rawMaterialId}
                            onChange={(event) => {
                              const selected = availableMaterials.find((material) => material.id === event.target.value);
                              if (selected) setSelectedMaterialOptions((current) => ({ ...current, [selected.id]: selected }));
                              setRequestLines((current) => current.map((item, lineIndex) => lineIndex === index
                                ? { ...item, rawMaterialId: event.target.value, isAsset: getMasterAsset(selected) }
                                : item));
                            }}
                            options={[{ value: "", label: masterOptionsLoading ? "Loading raw materials…" : "Select raw material" }, ...availableMaterials.map((material) => ({ value: material.id, label: material.label }))]}
                            disabled={masterOptionsLoading || Boolean(lookupsError) || !line.entityId}
                            required
                          />
                        );
                      }
                      if (fieldKey === "isAsset") {
                        return line.isAsset ? <AssetPurchaseBadge /> : "Standard Purchase";
                      }
                      return (
                        <Input
                          aria-label={`Required quantity ${index + 1}${stockUom ? ` (${String(stockUom)})` : ""}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(event) => setRequestLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: event.target.value } : item))}
                          required
                        />
                      );
                    }}
                    emptyMessage={`Add a material line to start an ${documentLabel} request.`}
                  />
                  {hasMixedRequestEntities && (
                    <p className="text-xs text-amber-700" role="alert">All material lines in one request batch must use the same Entity.</p>
                  )}
                  {!masterOptionsLoading && !lookupsError && availableMaterials.length === 0 && <EmptyState message={assetMode ? "No active asset raw materials are available in the organization master data." : "No active raw materials are available in the organization master data."} />}
                </section>
              )}

              {stage === "approve-price" && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Pending approvals</h2>
                    <p className="mt-1 text-xs text-slate-500">Enter or update values in each row, then save and approve individually. Select a row to open full details.</p>
                  </div>
                  <GeneralPoReport
                    title="Pending vendor and price approvals"
                    records={activePendingRequests.map((request) => ({
                      ...request,
                      vendorName: request.vendor?.name ?? "Not assigned",
                      price: request.vendorPrice === null ? "Not set" : request.vendorPrice.toFixed(4),
                      quantityLabel: `${request.quantity} ${request.stockUom}`,
                    }))}
                    fields={[
                      { key: "entityName", label: "Entity" },
                      { key: "rawMaterial", label: "Raw Material" },
                      { key: "isAsset", label: "Asset Purchase" },
                      { key: "category", label: "Category" },
                      { key: "vendorEntry", label: "Vendor" },
                      { key: "gstEntry", label: "GST %" },
                      { key: "hsnEntry", label: "HSN" },
                      { key: "quantityEntry", label: "Quantity" },
                      { key: "priceEntry", label: "Unit Price" },
                      { key: "status", label: "Status" },
                    ]}
                    storageKey={assetMode ? `asset-po-price-approvals:${organizationId}` : `general-po-price-approvals-v2:${organizationId}`}
                    rowIdSelector={(request) => request.id}
                    onRowClick={(requestId) => router.push(`${basePath}/approve-price/${encodeURIComponent(requestId)}`)}
                    renderCell={(fieldKey, request) => {
                      const draft = getInlinePriceDraft(request);
                      const cellClick = (event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation();
                      if (fieldKey === "vendorEntry") {
                        return (
                          <div onClick={cellClick} className="min-w-36">
                            <Select
                              aria-label={`Vendor for ${request.rawMaterial}`}
                              value={draft.vendorId}
                              onChange={(event) => updateInlinePriceDraft(request, "vendorId", event.target.value)}
                              options={[
                                { value: "", label: masterOptionsLoading ? "Loading…" : "Select vendor" },
                                ...vendors.map((option) => ({ value: option.id, label: option.label })),
                              ]}
                              disabled={masterOptionsLoading || Boolean(lookupsError)}
                              className="h-8 min-w-36 rounded-lg px-2 py-1 text-[11px]"
                            />
                          </div>
                        );
                      }
                      if (fieldKey === "gstEntry") {
                        return (
                          <div onClick={cellClick} className="min-w-24">
                            <Select
                              aria-label={`GST percentage for ${request.rawMaterial}`}
                              value={draft.gstMasterId}
                              onChange={(event) => updateInlinePriceDraft(request, "gstMasterId", event.target.value)}
                              options={[
                                { value: "", label: masterOptionsLoading ? "Loading…" : "Select GST" },
                                ...gstRates.map((option) => ({ value: option.id, label: `${getMasterGst(option)}%` })),
                              ]}
                              disabled={masterOptionsLoading || Boolean(lookupsError)}
                              className="h-8 min-w-24 rounded-lg px-2 py-1 text-[11px]"
                            />
                          </div>
                        );
                      }
                      if (fieldKey === "hsnEntry") {
                        return (
                          <div onClick={cellClick} className="min-w-28">
                            <Select
                              aria-label={`HSN code for ${request.rawMaterial}`}
                              value={draft.hsnCode}
                              onChange={(event) => updateInlinePriceDraft(request, "hsnCode", event.target.value)}
                              options={[
                                { value: "", label: masterOptionsLoading ? "Loading…" : "Select HSN" },
                                ...hsnCodes.map((option) => ({ value: getMasterHsn(option), label: option.label })),
                              ]}
                              disabled={masterOptionsLoading || Boolean(lookupsError)}
                              className="h-8 min-w-28 rounded-lg px-2 py-1 text-[11px]"
                            />
                          </div>
                        );
                      }
                      if (fieldKey === "quantityEntry") {
                        return (
                          <div onClick={cellClick} className="min-w-24">
                            <Input
                              aria-label={`Purchase quantity in ${request.stockUom}`}
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={draft.quantity}
                              onChange={(event) => updateInlinePriceDraft(request, "quantity", event.target.value)}
                              className="h-8 min-w-24 rounded-lg px-2 py-1 text-[11px]"
                            />
                          </div>
                        );
                      }
                      if (fieldKey === "priceEntry") {
                        return (
                          <div onClick={cellClick} className="min-w-28">
                            <Input
                              aria-label={`Unit price for ${request.rawMaterial}`}
                              type="number"
                              min="0"
                              step="0.0001"
                              value={draft.vendorPrice}
                              onChange={(event) => updateInlinePriceDraft(request, "vendorPrice", event.target.value)}
                              className="h-8 min-w-28 rounded-lg px-2 py-1 text-[11px]"
                            />
                          </div>
                        );
                      }
                      if (fieldKey === "status") return <StatusBadge status={request.status} />;
                      if (fieldKey === "isAsset") return request.isAsset ? <AssetPurchaseBadge /> : "Standard Purchase";
                      if (fieldKey === "quantityLabel") return String(request.quantityLabel);
                      if (fieldKey === "price") return String(request.price);
                      return String(request[fieldKey as keyof typeof request] ?? "—");
                    }}
                    rowActions={(request) => {
                      const draft = getInlinePriceDraft(request);
                      const gstOption = gstRates.find((option) => option.id === draft.gstMasterId);
                      const saved = Boolean(
                        request.vendor
                        && request.vendorPrice !== null
                        && request.gst !== null
                        && request.hsnCode
                        && request.vendor.id === draft.vendorId
                        && request.vendorPrice === Number(draft.vendorPrice)
                        && request.gst === Number(getMasterGst(gstOption ?? { id: "", label: "" }))
                        && request.hsnCode === draft.hsnCode
                        && request.quantity === Number(draft.quantity),
                      );
                      const valid = Boolean(
                        draft.vendorId
                        && draft.vendorPrice.trim()
                        && Number.isFinite(Number(draft.vendorPrice))
                        && Number(draft.vendorPrice) >= 0
                        && gstOption
                        && draft.hsnCode
                        && Number.isFinite(Number(draft.quantity))
                        && Number(draft.quantity) > 0,
                      );
                      return (
                        <div className="flex min-w-32 flex-col items-start gap-1">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 min-h-7 px-2 py-1 text-[10px]"
                              disabled={!valid || masterOptionsLoading || Boolean(busy)}
                              onClick={() => void saveInlinePrice(request)}
                            >
                              {busy === `save-general-price:${request.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 min-h-7 px-2 py-1 text-[10px]"
                              disabled={!saved || Boolean(busy)}
                              onClick={() => void approveInlinePrice(request)}
                            >
                              {busy === `approve-general-price:${request.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                            </Button>
                          </div>
                          {priceErrors[request.id] && (
                            <p role="alert" className="max-w-48 whitespace-normal text-[10px] text-red-700">{priceErrors[request.id]}</p>
                          )}
                        </div>
                      );
                    }}
                    emptyMessage={`No ${assetMode ? "asset " : ""}requests are waiting for vendor and price approval.`}
                  />
                  <LoadMoreButton hasMore={Boolean(nextCursor)} loading={loadingMore} onClick={loadMoreRequests} />
                </section>
              )}

              {stage === "master-group" && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Create {documentLabel} Master Groups</h2>
                    <p className="mt-1 text-xs text-slate-500">Selected requests are grouped only when Entity, asset classification, vendor, material, price, GST, HSN and stock UOM match. Different compatible materials become separate Master Groups.</p>
                  </div>
                  {(hasMixedSelectedRequestAssets || error.includes("Asset and non-asset requests")) && (
                    <p role="alert" className="rounded-lg border border-[var(--erp-warning-border)] bg-[var(--erp-warning-bg)] px-3 py-2 text-xs text-[var(--erp-warning-text)]">
                      Asset and non-asset requests cannot be grouped together. Select only one classification.
                    </p>
                  )}
                  <GeneralPoReport
                    title="Approved requests ready for Master Grouping"
                    records={pendingGroupingRequests.map((request) => ({
                      ...request,
                      vendorName: request.vendor?.name ?? "Vendor missing",
                      quantityLabel: `${request.quantity} ${request.stockUom}`,
                      price: request.vendorPrice?.toFixed(4) ?? "—",
                      taxDetails: `${request.gst ?? 0}% / ${request.hsnCode ?? "—"}`,
                    }))}
                    fields={[
                      { key: "entityName", label: "Entity" },
                      { key: "rawMaterial", label: "Raw Material" },
                      { key: "isAsset", label: "Asset Purchase" },
                      { key: "category", label: "Category" },
                      { key: "vendorName", label: "Vendor" },
                      { key: "quantityLabel", label: "Quantity" },
                      { key: "price", label: "Unit Price" },
                      { key: "taxDetails", label: "GST / HSN" },
                    ]}
                    storageKey={`${assetMode ? "asset-po" : "general-po"}-master-grouping:${organizationId}`}
                    rowIdSelector={(request) => request.id}
                    selectedIds={selectedIds}
                    selectable
                    rowSelectable={(request) => !selectedIds.length || selectedIds.includes(request.id)
                      || pendingGroupingRequests.find((item) => item.id === selectedIds[0])?.isAsset === request.isAsset}
                    onToggleSelectAll={toggleAllRequestSelection}
                    onToggleRowSelection={toggleRequestSelection}
                    toolbarActions={(
                      <>
                        {pendingGroupingRequests.some((request) => selectedIds.includes(request.id) && !request.entityId) && (
                          <Select
                            aria-label="Entity for legacy requests"
                            value={groupEntityId}
                            onChange={(event) => setGroupEntityId(event.target.value)}
                            options={[{ value: "", label: masterOptionsLoading ? "Loading entities…" : "Select Entity" }, ...entities.map((entity) => ({ value: entity.id, label: entity.label }))]}
                            disabled={masterOptionsLoading || Boolean(lookupsError)}
                            required
                          />
                        )}
                        {selectedIds.length > 0 && (
                          <Button onClick={createGroups} disabled={Boolean(busy) || hasMixedSelectedRequestAssets}>
                            {busy === "create-groups" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shapes className="h-4 w-4" />}
                            Create Master Groups ({selectedIds.length})
                          </Button>
                        )}
                      </>
                    )}
                    renderCell={(fieldKey, request) => fieldKey === "isAsset"
                      ? request.isAsset ? <AssetPurchaseBadge /> : "Standard Purchase"
                      : String(request[fieldKey as keyof typeof request] ?? "—")}
                    emptyMessage={`No approved, ungrouped ${assetMode ? "asset " : ""}requests are ready for Master Grouping.`}
                  />
                  <LoadMoreButton hasMore={Boolean(nextCursor)} loading={loadingMore} onClick={loadMoreRequests} />
                </section>
              )}

              {stage === "create-po" && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Create Purchase Order from {documentLabel} Master Groups</h2>
                    <p className="mt-1 text-xs text-slate-500">Select groups for one Entity, vendor, and asset classification. The generated draft uses the shared Purchase Order flow and can be submitted for approval.</p>
                  </div>
                  {(hasMixedGroupAssets || error.includes("Asset and non-asset Master Groups")) && (
                    <p role="alert" className="rounded-lg border border-[var(--erp-warning-border)] bg-[var(--erp-warning-bg)] px-3 py-2 text-xs text-[var(--erp-warning-text)]">
                      Asset and non-asset Master Groups cannot be combined in one Purchase Order. Select only one classification.
                    </p>
                  )}
                  <GeneralPoReport
                    title="Master Groups ready for Purchase Order"
                    records={generalGroups.filter((group) => group.status === "MASTER_GROUPED")}
                    fields={[
                      { key: "number", label: "Master Group" },
                      { key: "entityName", label: "Entity" },
                      { key: "rawMaterial", label: "Raw Material" },
                      { key: "isAsset", label: "Asset Purchase" },
                      { key: "vendorName", label: "Vendor" },
                      { key: "quantityLabel", label: "Quantity" },
                      { key: "vendorPrice", label: "Unit Price" },
                      { key: "taxDetails", label: "GST / HSN" },
                    ]}
                    storageKey={`${assetMode ? "asset-po" : "general-po"}-create-po-groups:${organizationId}`}
                    rowIdSelector={(group) => group.id}
                    selectedIds={selectedGroupIds}
                    selectable
                    rowSelectable={(group) => !selectedGroupIds.length || selectedGroupIds.includes(group.id)
                      || (group.isAsset === selectedGroups[0]?.isAsset
                        && group.vendor.id === selectedGroupVendorId
                        && group.entityId === selectedGroupEntityId)}
                    onToggleSelectAll={(checked, ids) => {
                      if (!checked) {
                        setSelectedGroupIds([]);
                        setError("");
                        return;
                      }
                      const candidates = generalGroups
                        .filter((group) => ids.includes(group.id) && group.status === "MASTER_GROUPED")
                      const selectedAssetClass = selectedGroups[0]?.isAsset;
                      if (selectedAssetClass === undefined
                        && new Set(candidates.map((group) => group.isAsset)).size > 1) {
                        setSelectedGroupIds([]);
                        setError("Asset and non-asset Master Groups must be used in separate Purchase Orders. Select one classification at a time.");
                        return;
                      }
                      const compatibleIds = candidates
                        .filter((group) => selectedAssetClass === undefined || group.isAsset === selectedAssetClass)
                        .filter((group) => !selectedGroups.length
                          || (group.vendor.id === selectedGroupVendorId && group.entityId === selectedGroupEntityId))
                        .map((group) => group.id);
                      setError("");
                      setSelectedGroupIds(compatibleIds);
                    }}
                    onToggleRowSelection={(id, checked) => {
                      if (checked) toggleGroup(id);
                      else {
                        setSelectedGroupIds((current) => current.filter((groupId) => groupId !== id));
                        setError("");
                      }
                    }}
                    toolbarActions={selectedGroupIds.length > 0 ? (
                      <>
                        <span className="text-xs font-semibold">{selectedGroupIds.length} group(s) · {selectedGroups[0]?.entityName} · {selectedGroups[0]?.vendor.name}</span>
                        <Input aria-label="PO date" type="date" value={poDate} onChange={(event) => setPoDate(event.target.value)} required />
                        <Input aria-label="Delivery date" type="date" min={poDate} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
                        <Button onClick={createPo} disabled={busy === "create-po" || !poDate || hasMixedGroupAssets}>
                          {busy === "create-po" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}Create draft PO
                        </Button>
                      </>
                    ) : null}
                    renderCell={(fieldKey, group) => {
                      if (fieldKey === "vendorName") return group.vendor.name;
                      if (fieldKey === "isAsset") return group.isAsset ? <AssetPurchaseBadge /> : "Standard Purchase";
                      if (fieldKey === "quantityLabel") return `${group.quantity} ${group.stockUom}`;
                      if (fieldKey === "taxDetails") return `${group.gst}% / ${group.hsnCode}`;
                      return String(group[fieldKey as keyof typeof group] ?? "—");
                    }}
                    emptyMessage={`No ${documentLabel} Master Groups are ready for PO creation.`}
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

function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (value) => value.toUpperCase());
  const color = status === "PRICE_APPROVED" || status === "APPROVED" || status === "MASTER_GROUPED"
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
