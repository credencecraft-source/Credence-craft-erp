"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  PackageSearch,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";

type BomRow = {
  id: string;
  entityId?: string | null;
  entityName?: string | null;
  orderId: string;
  orderNo: string | null;
  styleName: string | null;
  brand: string | null;
  category: string | null;
  subCategory: string | null;
  itemName: string | null;
  stockUom: string | null;
  internalConsumption: number | null;
  requiredQty: number | null;
  remainingQty: number | null;
};

type VendorOption = { id: string; label: string; isCurrentStore: boolean };
type RawMaterialStockOption = {
  id: string;
  entity_id: string;
  raw_material: string;
  location: { location_name: string };
  quantity_on_hand: number | string;
  quantity_reserved: number | string;
};
type GstOption = {
  id: string;
  label: string;
  fields?: Record<string, unknown>;
};
type UomConvertOption = {
  id: string;
  value_id?: string;
  label: string;
  parent_id?: string | null;
  fields?: Record<string, unknown>;
};
type MaterialGroup = {
  key: string;
  entityId: string | null;
  entityName: string;
  rawMaterialName: string;
  stockUom: string | null;
  category: string;
  subCategory: string;
  groupedQty: number;
  rows: BomRow[];
};
type MaterialCategory = {
  key: string;
  label: string;
  groupCount: number;
  lineCount: number;
};
type GroupedLine = Omit<BomRow, "orderId" | "remainingQty"> & {
  groupedQty: string;
  vendorPrice: string;
};
export type GroupedPurchaseOrder = {
  id: string;
  sourceType?: string;
  entityId: string | null;
  entityName: string;
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
  stockUom?: string | null;
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
  gst?: number | null;
  hsnCode?: string | null;
  otherChargesInr?: number | null;
  organizationState?: string | null;
  organizationGstin?: string | null;
  vendor: {
    id: string;
    name: string;
    gstin?: string | null;
    registeredState?: string | null;
  };
  lines: Array<{
    id: string;
    bomItemId: string;
    orderNo: string | null;
    styleName: string | null;
    brand: string | null;
    category: string | null;
    subCategory: string | null;
    itemName: string | null;
    stockUom: string | null;
    internalConsumption: number | null;
    requiredQty: number | null;
    groupedQty: number | null;
    vendorPrice: number | null;
    categoryType?: string | null;
    internalPriceBom?: number | null;
    otherChargesPerItem?: number | null;
    totalExtra?: number | null;
    totalSpend?: number | null;
    total?: number | null;
    gst?: number | string | null;
    hsnCode?: string | null;
  }>;
};

export type MasterPurchaseOrder = {
  id: string;
  entityId: string | null;
  entityName: string;
  masterPoNo: string;
  status: string;
  sourceType: string;
  rawMaterial: string | null;
  category: string | null;
  subCategory: string | null;
  totalRequiredQty: number | null;
  totalGroupedQty: number | null;
  noOfStyles: number | null;
  price: string;
  gst: string;
  hsnCode: string;
  buyingUom: string;
  total: number;
  vendor: { id: string; name: string };
  sourceGroupedPoIds: string[];
  purchaseOrderCreated?: boolean;
  lines: Array<{
    id: string;
    sourceGroupedPoNo: string | null;
    sourceOrderNo: string | null;
    styleName: string | null;
    rawMaterial?: string | null;
    stockUom?: string | null;
    groupedQty: number | null;
    vendorPrice: number | null;
    totalSpend: number | null;
  }>;
};

export type StyleWiseStage = "allocate" | "price" | "create";

const formatNumber = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const text = (value: unknown, fallback = "-") =>
  value === null || value === undefined || value === ""
    ? fallback
    : String(value);

function registrationStateCode(
  state: string | null | undefined,
  gstin: string | null | undefined,
) {
  const normalizedGstin = String(gstin ?? "")
    .trim()
    .toUpperCase();
  if (/^\d{2}[A-Z0-9]{13}$/.test(normalizedGstin))
    return normalizedGstin.slice(0, 2);
  return String(state ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.\-]+/g, " ")
    .replace(/\s+/g, " ");
}

export default function StyleWisePurchaseOrderPage({
  initialStage = "allocate",
}: {
  initialStage?: StyleWiseStage;
}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const procurementPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`;
  const styleWisePath = `${procurementPath}/create-po/style-wise`;
  const [stage, setStage] = useState<StyleWiseStage>(initialStage);
  const loadedStageData = useRef(new Set<string>());
  const stageDataRequests = useRef(new Map<string, Promise<void>>());
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [gstOptions, setGstOptions] = useState<GstOption[]>([]);
  const [groupedPurchaseOrders, setGroupedPurchaseOrders] = useState<
    GroupedPurchaseOrder[]
  >([]);
  const [masterPurchaseOrders, setMasterPurchaseOrders] = useState<
    MasterPurchaseOrder[]
  >([]);
  const [loading, setLoading] = useState(initialStage === "allocate");
  const [priceLoading, setPriceLoading] = useState(initialStage !== "allocate");
  const [groupedNextCursor, setGroupedNextCursor] = useState<string | null>(null);
  const [masterNextCursor, setMasterNextCursor] = useState<string | null>(null);
  const [loadingMoreDataset, setLoadingMoreDataset] = useState<"grouped" | "master" | null>(null);
  const [allocationNextCursor, setAllocationNextCursor] = useState<string | null>(null);
  const [loadingMoreAllocation, setLoadingMoreAllocation] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGroupedForm, setShowGroupedForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadAllocatableRows = async (append = false) => {
    const query = new URLSearchParams({ organizationId, view: "allocatable", limit: "100" });
    if (append && allocationNextCursor) query.set("cursor", allocationNextCursor);
    const response = await fetch(`/api/orders/procurement?${query.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.error || "Unable to load raw-material rows.");
    const page = data.bomRows ?? [];
    setBomRows((current) => append ? [...current, ...page] : page);
    setAllocationNextCursor(data.nextCursor ?? null);
    if (!append) loadedStageData.current.add(`${organizationId}:allocation`);
  };

  const loadMoreAllocatableRows = async () => {
    if (!allocationNextCursor || loadingMoreAllocation) return;
    setLoadingMoreAllocation(true);
    try {
      await loadAllocatableRows(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more raw-material rows.");
    } finally {
      setLoadingMoreAllocation(false);
    }
  };

  const loadVendors = async () => {
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/master-data/vendor?includeInactive=false&includeDummyData=true`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load vendors.");
    setVendors(
      (Array.isArray(data) ? data : []).map(
        (value: { id: string; label: string; fields?: Record<string, unknown> }) => ({
          id: value.id,
          label: value.label,
          isCurrentStore: value.fields?.Is_this_Current_Store === true,
        }),
      ),
    );
    loadedStageData.current.add(`${organizationId}:vendors`);
  };

  const loadGstOptions = async () => {
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.error || "Unable to load GST master.");
    setGstOptions(Array.isArray(data) ? data : []);
    loadedStageData.current.add(`${organizationId}:gst`);
  };

  const loadPriceApprovals = async (appendDataset?: "grouped" | "master", requestedView?: "price-approval" | "create") => {
    if (!appendDataset) {
      loadedStageData.current.delete(`${organizationId}:price`);
      loadedStageData.current.delete(`${organizationId}:create`);
    }
    if (appendDataset) setLoadingMoreDataset(appendDataset);
    try {
      const view = requestedView ?? (stage === "create" ? "create" : "price-approval");
      const query = new URLSearchParams({ organizationId, view, limit: "50" });
      if (!appendDataset) query.set("include", view === "create" ? "master" : "grouped");
      if (appendDataset) {
        query.set("include", appendDataset);
        const cursor = appendDataset === "grouped" ? groupedNextCursor : masterNextCursor;
        if (cursor) query.set(appendDataset === "grouped" ? "cursor" : "masterCursor", cursor);
      }
      const response = await fetch(
        `/api/orders/procurement?${query.toString()}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to load price approvals.");
      if (Array.isArray(data.groupedPurchaseOrders)) {
        setGroupedPurchaseOrders((current) => appendDataset === "grouped" ? [...current, ...data.groupedPurchaseOrders] : data.groupedPurchaseOrders);
        setGroupedNextCursor(data.nextGroupedCursor ?? null);
        loadedStageData.current.add(`${organizationId}:price`);
      }
      if (Array.isArray(data.masterPurchaseOrders)) {
        setMasterPurchaseOrders((current) => appendDataset === "master" ? [...current, ...data.masterPurchaseOrders] : data.masterPurchaseOrders);
        setMasterNextCursor(data.nextMasterCursor ?? null);
        loadedStageData.current.add(`${organizationId}:create`);
      }
    } finally {
      if (appendDataset) setLoadingMoreDataset(null);
    }
  };

  const loadOnce = (key: string, loader: () => Promise<void>) => {
    const cacheKey = `${organizationId}:${key}`;
    if (loadedStageData.current.has(cacheKey)) return Promise.resolve();
    const existing = stageDataRequests.current.get(cacheKey);
    if (existing) return existing;
    const request = loader()
      .then(() => { loadedStageData.current.add(cacheKey); })
      .finally(() => stageDataRequests.current.delete(cacheKey));
    stageDataRequests.current.set(cacheKey, request);
    return request;
  };

  const loadStageData = (targetStage: StyleWiseStage) => {
    const requests: Promise<void>[] = [];
    if (targetStage === "allocate") {
      const needsAllocation = !loadedStageData.current.has(`${organizationId}:allocation`);
      const needsVendors = !loadedStageData.current.has(`${organizationId}:vendors`);
      if (needsAllocation) requests.push(loadOnce("allocation", loadAllocatableRows));
      if (needsVendors) requests.push(loadOnce("vendors", loadVendors));
      return Promise.all(requests).then(() => undefined);
    }

    if (targetStage === "price") {
      if (!loadedStageData.current.has(`${organizationId}:price`)) {
        requests.push(loadOnce("price", () => loadPriceApprovals(undefined, "price-approval")));
      }
      if (!loadedStageData.current.has(`${organizationId}:gst`)) requests.push(loadOnce("gst", loadGstOptions));
    } else if (!loadedStageData.current.has(`${organizationId}:create`)) {
      requests.push(loadOnce("create", () => loadPriceApprovals(undefined, "create")));
    }
    return Promise.all(requests).then(() => undefined);
  };

  const selectStage = (nextStage: StyleWiseStage) => {
    const nextPath = nextStage === "allocate"
      ? styleWisePath
      : `${styleWisePath}/${nextStage === "price" ? "approve-price" : "create-po"}`;
    if (window.location.pathname !== nextPath) window.history.pushState(null, "", nextPath);
    if (nextStage === "allocate") {
      setPriceLoading(false);
      if (!loadedStageData.current.has(`${organizationId}:allocation`) || !loadedStageData.current.has(`${organizationId}:vendors`)) setLoading(true);
    } else {
      setLoading(false);
      const needsPriceData = nextStage === "price"
        ? !loadedStageData.current.has(`${organizationId}:price`) || !loadedStageData.current.has(`${organizationId}:gst`)
        : !loadedStageData.current.has(`${organizationId}:create`);
      setPriceLoading(needsPriceData);
    }
    setStage(nextStage);
  };

  const preloadStage = (targetStage: StyleWiseStage) => {
    void loadStageData(targetStage).catch(() => undefined);
  };

  useEffect(() => {
    if (stage !== "allocate") return;
    let mounted = true;
    loadStageData("allocate")
      .catch((loadError) => {
        if (mounted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load procurement.",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [organizationId, stage]);

  useEffect(() => {
    if (stage !== "price" && stage !== "create") return;
    let mounted = true;
    loadStageData(stage)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load price approvals."))
      .finally(() => {
        if (mounted) setPriceLoading(false);
      });
    return () => { mounted = false; };
  }, [stage, organizationId]);

  useEffect(() => {
    const syncStageFromHistory = () => {
      if (window.location.pathname === styleWisePath) setStage("allocate");
      else if (window.location.pathname === `${styleWisePath}/approve-price`) setStage("price");
      else if (window.location.pathname === `${styleWisePath}/create-po`) setStage("create");
    };
    window.addEventListener("popstate", syncStageFromHistory);
    return () => window.removeEventListener("popstate", syncStageFromHistory);
  }, [styleWisePath]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return bomRows;
    return bomRows.filter((row) =>
      [
        row.orderNo,
        row.styleName,
        row.brand,
        row.category,
        row.subCategory,
        row.itemName,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [bomRows, search]);

  const materialGroups = useMemo<MaterialGroup[]>(() => {
    const grouped = new Map<string, MaterialGroup>();
    for (const row of bomRows) {
      const rawMaterialName = text(row.itemName, "Unclassified material");
      const category = text(row.category, "General");
      const subCategory = text(row.subCategory, "Uncategorised");
      const key = `${row.entityId ?? "missing"}|${rawMaterialName.toLowerCase()}|${category.toLowerCase()}|${subCategory.toLowerCase()}|${text(row.stockUom, "").toLowerCase()}`;
      const group = grouped.get(key) ?? {
        key,
        entityId: row.entityId ?? null,
        entityName: text(row.entityName, "Missing Entity"),
        rawMaterialName,
        stockUom: row.stockUom,
        category,
        subCategory,
        groupedQty: 0,
        rows: [],
      };
      group.groupedQty += Number(row.remainingQty ?? row.requiredQty ?? 0);
      group.rows.push(row);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((left, right) =>
      left.rawMaterialName.localeCompare(right.rawMaterialName),
    );
  }, [bomRows]);

  const filteredMaterialGroups = materialGroups.filter((group) => {
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      `${group.rawMaterialName} ${group.category} ${group.subCategory}`
        .toLowerCase()
        .includes(needle)
    );
  });
  const materialCategories = useMemo<MaterialCategory[]>(() => {
    const grouped = new Map<string, MaterialCategory>();
    for (const group of materialGroups) {
      const key = group.category.toLowerCase();
      const category = grouped.get(key) ?? {
        key,
        label: group.category,
        groupCount: 0,
        lineCount: 0,
      };
      category.groupCount += 1;
      category.lineCount += group.rows.length;
      grouped.set(key, category);
    }
    return [...grouped.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [materialGroups]);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(
    null,
  );
  const selectedCategory =
    materialCategories.find(
      (category) => category.key === selectedCategoryKey,
    ) ?? null;
  const categoryGroups = selectedCategoryKey
    ? filteredMaterialGroups.filter(
        (group) => group.category.toLowerCase() === selectedCategoryKey,
      )
    : [];
  const selectedMaterial =
    materialGroups.find((group) => group.key === selectedMaterialKey) ?? null;

  const selectedRows = bomRows.filter((row) => selectedIds.has(row.id));
  const toggleAll = () =>
    setSelectedIds((current) =>
      current.size === filteredRows.length
        ? new Set()
        : new Set(filteredRows.map((row) => row.id)),
    );
  const toggleRow = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openPriceStage = () => {
    setError("");
    setNotice("");
    selectStage("price");
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-3">
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:grid-cols-3">
        <StageButton
          number="01"
          label="Allocate vendor"
          active={stage === "allocate"}
          onClick={() => selectStage("allocate")}
          onMouseEnter={() => preloadStage("allocate")}
          onFocus={() => preloadStage("allocate")}
          icon={PackageSearch}
        />
        <StageButton
          number="02"
          label="Approve price"
          active={stage === "price"}
          onClick={() => selectStage("price")}
          onMouseEnter={() => preloadStage("price")}
          onFocus={() => preloadStage("price")}
          icon={ClipboardCheck}
        />
        <StageButton
          number="03"
          label="Create PO"
          active={stage === "create"}
          onClick={() => selectStage("create")}
          onMouseEnter={() => preloadStage("create")}
          onFocus={() => preloadStage("create")}
          icon={Check}
        />
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <Check className="h-4 w-4" />
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {stage === "allocate" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
                Stage 1
              </p>
              <h2 className="text-sm font-bold text-slate-950">
                Allocate vendor to raw materials
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search material or subcategory"
                  className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-emerald-500"
                />
              </div>
              {selectedMaterial && (
                <button
                  type="button"
                  onClick={() => setShowGroupedForm(true)}
                  disabled={selectedRows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Store className="h-3.5 w-3.5" /> Allocate vendor{" "}
                  <span className="rounded bg-white/20 px-1.5">
                    {selectedRows.length}
                  </span>
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <div className="erp-surface flex min-h-40 items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />{" "}
              Loading procurement categories
            </div>
          ) : selectedMaterial ? (
            <MaterialDetail
              group={selectedMaterial}
              selectedIds={selectedIds}
              onBack={() => {
                setSelectedMaterialKey(null);
                setSelectedIds(new Set());
              }}
              onToggleRow={toggleRow}
              onToggleAll={() =>
                setSelectedIds((current) =>
                  current.size === selectedMaterial.rows.length
                    ? new Set()
                    : new Set(selectedMaterial.rows.map((row) => row.id)),
                )
              }
            />
          ) : selectedCategory ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryKey(null);
                    setSearch("");
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Categories
                </button>
                <span className="text-slate-300">/</span>
                <h3 className="text-sm font-bold text-slate-950">
                  {selectedCategory.label}
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {categoryGroups.map((group) => (
                  <MaterialGroupCard
                    key={group.key}
                    group={group}
                    onClick={() => {
                      setSelectedMaterialKey(group.key);
                      setSelectedIds(new Set());
                    }}
                  />
                ))}
                {categoryGroups.length === 0 && (
                  <div className="erp-surface col-span-full p-8 text-center text-xs text-slate-500">
                    No raw materials match your search in this category.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {materialCategories.map((category) => (
                <MaterialCategoryCard
                  key={category.key}
                  category={category}
                  onClick={() => {
                    setSelectedCategoryKey(category.key);
                    setSearch("");
                  }}
                />
              ))}
              {materialCategories.length === 0 && (
                <div className="erp-surface col-span-full p-8 text-center text-xs text-slate-500">
                  No procurement categories found.
                </div>
              )}
            </div>
          )}
          {allocationNextCursor && (
            <div className="flex justify-center">
              <Button type="button" variant="secondary" size="sm" disabled={loadingMoreAllocation} onClick={() => void loadMoreAllocatableRows()}>
                {loadingMoreAllocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {loadingMoreAllocation ? "Loading raw materials" : "Load more raw materials"}
              </Button>
            </div>
          )}
        </section>
      ) : stage === "price" ? (
        <PriceApprovalStage
          groupedPurchaseOrders={groupedPurchaseOrders}
          gstOptions={gstOptions}
          loading={priceLoading}
          organizationId={organizationId}
          onUpdated={loadPriceApprovals}
          onApproved={() => selectStage("create")}
          onError={setError}
          hasMore={Boolean(groupedNextCursor)}
          loadingMore={loadingMoreDataset === "grouped"}
          onLoadMore={() => loadPriceApprovals("grouped").catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load more grouped POs."))}
        />
      ) : (
        <MasterPurchaseOrderReport
          masterPurchaseOrders={masterPurchaseOrders}
          onUpdated={loadPriceApprovals}
          hasMore={Boolean(masterNextCursor)}
          loadingMore={loadingMoreDataset === "master"}
          onLoadMore={() => loadPriceApprovals("master").catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load more Master Groups."))}
        />
      )}

      {showGroupedForm && (
        <GroupedPurchaseOrderForm
          rows={selectedRows}
          vendors={vendors}
          organizationId={organizationId}
          onClose={() => setShowGroupedForm(false)}
          onCreated={(source) => {
            setShowGroupedForm(false);
            setSelectedIds(new Set());
            setNotice(source === "stock" ? "Stock booked and reserved in General Inventory." : "Grouped PO submitted for Stage 2 price approval.");
            void loadAllocatableRows();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function MaterialCategoryCard({
  category,
  onClick,
}: {
  category: MaterialCategory;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-700">
            Material category
          </p>
          <h3 className="mt-1 truncate text-sm font-bold text-slate-950">
            {category.label}
          </h3>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-600" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
        <div>
          <p className="text-[9px] font-bold uppercase text-slate-500">
            Materials
          </p>
          <p className="text-sm font-bold text-slate-950">
            {category.groupCount}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-slate-500">Lines</p>
          <p className="text-sm font-bold text-slate-950">
            {category.lineCount}
          </p>
        </div>
      </div>
    </button>
  );
}

function MaterialGroupCard({
  group,
  onClick,
}: {
  group: MaterialGroup;
  onClick: () => void;
}) {
  const orderCount = new Set(group.rows.map((row) => row.orderNo)).size;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            {group.entityName} - {group.category}
          </p>
          <h3 className="mt-1 truncate text-base font-bold text-slate-950">
            {group.rawMaterialName}
          </h3>
          <p className="mt-1 truncate text-xs text-slate-500">
            {group.subCategory}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-emerald-700" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Stock UOM
          </p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {text(group.stockUom)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Grouped Qty
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">
            {formatNumber(group.groupedQty)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Related Orders
          </p>
          <p className="mt-1 text-xl font-bold text-slate-950">{orderCount}</p>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-slate-500">
        {group.rows.length} BOM line{group.rows.length === 1 ? "" : "s"} · Click
        to view details
      </p>
    </button>
  );
}

function MaterialDetail({
  group,
  selectedIds,
  onBack,
  onToggleRow,
  onToggleAll,
}: {
  group: MaterialGroup;
  selectedIds: Set<string>;
  onBack: () => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected =
    group.rows.length > 0 && group.rows.every((row) => selectedIds.has(row.id));
  return (
    <section className="erp-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to raw-material groups"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
              Selected raw material
            </p>
            <h3 className="mt-1 text-sm font-bold text-slate-950">
              {group.rawMaterialName} · {group.subCategory}
            </h3>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Selected records
          </p>
          <p className="text-lg font-bold text-emerald-700">
            {selectedIds.size}
          </p>
        </div>
      </div>
      <div className="border-b border-slate-200 px-4 py-2 text-[10px] text-slate-500">
        Select the BOM order records you want to include, then click Allocate
        Vendor above.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-[10px]">
          <thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2.5 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all related BOM records"
                  checked={allSelected}
                  onChange={onToggleAll}
                />
              </th>
              <th className="px-2.5 py-2">Order Name</th>
              <th className="px-2.5 py-2">Style Name</th>
              <th className="px-2.5 py-2">Brand</th>
              <th className="px-2.5 py-2">Category</th>
              <th className="px-2.5 py-2">Subcategory</th>
              <th className="px-2.5 py-2">Item</th>
              <th className="px-2.5 py-2">Internal Consumption</th>
              <th className="px-2.5 py-2 text-right">Required Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.rows.map((row) => (
              <tr
                key={row.id}
                className={
                  selectedIds.has(row.id)
                    ? "bg-emerald-50/60"
                    : "hover:bg-emerald-50/40"
                }
              >
                <td className="px-2.5 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${text(row.orderNo)} BOM record`}
                    checked={selectedIds.has(row.id)}
                    onChange={() => onToggleRow(row.id)}
                  />
                </td>
                <td className="px-2.5 py-2 font-semibold text-slate-800">
                  {text(row.orderNo)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.styleName)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.brand)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.category)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {text(row.subCategory)}
                </td>
                <td className="px-2.5 py-2 font-semibold text-slate-900">
                  {text(row.itemName)}
                </td>
                <td className="px-2.5 py-2 text-slate-700">
                  {formatNumber(row.internalConsumption)}
                </td>
                <td className="px-2.5 py-2 text-right font-bold text-slate-900">
                  {formatNumber(row.requiredQty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StageButton({
  number,
  label,
  active,
  disabled,
  onClick,
  onMouseEnter,
  onFocus,
  icon: Icon,
}: {
  number: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  icon: typeof Check;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-emerald-300"}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-600"}`}
      >
        {number}
      </span>
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="truncate text-[10px] font-semibold text-slate-700">
        {label}
      </span>
    </button>
  );
}

function GroupedPurchaseOrderForm({
  rows,
  vendors,
  organizationId,
  onClose,
  onCreated,
  onError,
}: {
  rows: BomRow[];
  vendors: VendorOption[];
  organizationId: string;
  onClose: () => void;
  onCreated: (source: "stock" | "vendor") => void;
  onError: (message: string) => void;
}) {
  const routeParams = useParams<{
    workspaceId: string;
    organizationId: string;
  }>();
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [takingFromStock, setTakingFromStock] = useState(false);
  const [stockRows, setStockRows] = useState<RawMaterialStockOption[]>([]);
  const [stockIds, setStockIds] = useState<Record<string, string>>({});
  const [stockLoading, setStockLoading] = useState(true);
  const [lines, setLines] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.id, String(row.remainingQty ?? row.requiredQty ?? "")]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const currentStoreVendor = vendors.find((vendor) => vendor.isCurrentStore);
  const stockOptionsFor = (row: BomRow) => stockRows.filter((stock) =>
    stock.entity_id === row.entityId
    && stock.raw_material.trim().toLowerCase() === String(row.itemName ?? "").trim().toLowerCase()
    && Number(stock.quantity_on_hand) > Number(stock.quantity_reserved),
  );
  const availableQty = (stock: RawMaterialStockOption) => Number(stock.quantity_on_hand) - Number(stock.quantity_reserved);
  const currentStockOptions = rows[0]
    ? stockRows.filter((stock) =>
        stock.entity_id === rows[0].entityId
        && stock.raw_material.trim().toLowerCase() === String(rows[0].itemName ?? "").trim().toLowerCase()
        && availableQty(stock) > 0,
      )
    : [];
  const currentStockQty = currentStockOptions.reduce(
    (total, stock) => total + availableQty(stock),
    0,
  );
  const selectedStockFor = (row: BomRow) => {
    const options = stockOptionsFor(row);
    return options.find((stock) => stock.id === stockIds[row.id]) ?? (options.length === 1 ? options[0] : null);
  };

  useEffect(() => {
    let mounted = true;
    fetch(`/api/inventory/stock?organizationId=${encodeURIComponent(organizationId)}&type=RM`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load available stock.");
        if (mounted) setStockRows(Array.isArray(data.stock) ? data.stock : []);
      })
      .catch((error) => onError(error instanceof Error ? error.message : "Unable to load available stock."))
      .finally(() => { if (mounted) setStockLoading(false); });
    return () => { mounted = false; };
  }, [organizationId, onError]);

  const selectStockAllocation = (checked: boolean) => {
    setTakingFromStock(checked);
    if (!checked) {
      setVendorId("");
      setLines(Object.fromEntries(rows.map((row) => [row.id, String(row.remainingQty ?? row.requiredQty ?? "")])));
      return;
    }
    if (currentStoreVendor) setVendorId(currentStoreVendor.id);
    setLines(Object.fromEntries(rows.map((row) => {
      const options = stockOptionsFor(row);
      const selectedStock = options.find((stock) => stock.id === stockIds[row.id]) ?? (options.length === 1 ? options[0] : null);
      return [row.id, selectedStock ? String(Math.min(Number(row.remainingQty ?? row.requiredQty ?? 0), availableQty(selectedStock))) : "0"];
    })));
  };

  const updateQty = (row: BomRow, value: string) =>
    setLines((current) => ({
      ...current,
      [row.id]: value === "" ? "" : String(Math.min(
        Number(value),
        Number(row.remainingQty ?? row.requiredQty ?? 0),
        takingFromStock ? (selectedStockFor(row) ? availableQty(selectedStockFor(row)!) : 0) : Number.POSITIVE_INFINITY,
      )),
    }));
  const submit = async () => {
    setSubmitting(true);
    try {
      if (takingFromStock) {
        const bookingLines = rows.filter((row) => Number(lines[row.id]) > 0).map((row) => ({
          bomItemId: row.id,
          takeFromStockId: stockIds[row.id] || stockOptionsFor(row)[0]?.id || "",
          bookedQuantity: lines[row.id],
        }));
        if (!currentStoreVendor) throw new Error("Mark one Vendor Master record as the current store before booking stock.");
        if (bookingLines.some((line) => !line.takeFromStockId)) throw new Error("Select an available stock source for every booked line.");
        if (bookingLines.length === 0) throw new Error("Enter a positive quantity to book from stock.");
        const response = await fetch(`/api/inventory/booked-stock?organizationId=${encodeURIComponent(organizationId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, currentStoreVendorId: currentStoreVendor.id, lines: bookingLines }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to book stock.");
        onCreated("stock");
        return;
      }
      const response = await fetch(
        `/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            vendorId,
            lines: rows.filter((row) => Number(lines[row.id]) > 0).map((row) => ({
              bomItemId: row.id,
              groupedQty: lines[row.id],
            })),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to submit grouped PO.");
      onCreated("vendor");
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to submit grouped PO.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const invalidStockLines = rows.some((row) => Number(lines[row.id] ?? 0) > 0 && (
    !selectedStockFor(row)
    || Number(lines[row.id]) > Number(row.remainingQty ?? row.requiredQty ?? 0)
    || Number(lines[row.id]) > availableQty(selectedStockFor(row)!)
  ));
  const noStockQuantity = rows.every((row) => Number(lines[row.id] ?? 0) <= 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grouped-po-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-[1250px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
              {takingFromStock ? "Take from Stock" : "New grouped PO"}
            </p>
            <h2
              id="grouped-po-title"
              className="mt-1 text-lg font-bold text-slate-950"
            >
              {takingFromStock ? "Book selected inventory" : "Allocate selected raw materials"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {takingFromStock ? "Booked quantity is reserved in General Inventory and reduces the remaining BOM requirement." : "This grouped PO will be submitted to Stage 2 price approval."}
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            <div className="min-w-[118px] rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-right">
              <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-800">
                Available stock
              </p>
              <p className="text-sm font-bold tabular-nums text-emerald-950">
                {stockLoading
                  ? "Loading..."
                  : `${formatNumber(currentStockQty)} ${text(rows[0]?.stockUom, "units")}`}
              </p>
            </div>
            {!stockLoading && currentStockQty > 0 && (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <Checkbox
                  checked={takingFromStock}
                  disabled={!currentStoreVendor}
                  onChange={(event) => selectStockAllocation(event.target.checked)}
                  label="Take from Stock"
                  className="h-3.5 w-3.5"
                />
                {takingFromStock && currentStoreVendor ? (
                  <p className="ml-6 mt-1 text-[10px] font-semibold text-emerald-800">
                    Current store: {currentStoreVendor.label}
                  </p>
                ) : !currentStoreVendor ? (
                  <p className="ml-6 mt-1 max-w-52 text-[10px] text-slate-500">
                    Mark an active vendor as the current store to enable stock booking.
                  </p>
                ) : null}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close grouped PO form"
              className="min-h-7 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <label className="block max-w-sm text-xs font-bold text-slate-700">
            Vendor lookup
            <Select
              value={vendorId}
              disabled={takingFromStock}
              onChange={(event) => {
                setVendorId(event.target.value);
                setLines(Object.fromEntries(rows.map((row) => [row.id, String(row.remainingQty ?? row.requiredQty ?? "")])));
              }}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500"
            >
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="mt-2 flex max-w-sm justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                router.push(
                  `/dashboard/${routeParams.workspaceId}/organizations/${routeParams.organizationId}/admin/master-data/vendor`,
                )
              }
              className="shrink-0 rounded-md px-3 py-2 text-xs font-semibold"
            >
              Open Vendor Master
            </Button>
          </div>
        </div>
        <div className="min-h-0 overflow-auto p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-900">
              {takingFromStock ? "Stock booking subform" : "Grouped PO subform"}
            </p>
            <span className="text-[10px] text-slate-500">
              {rows.length} selected lines
            </span>
          </div>
          <table className="w-full min-w-[1050px] text-left text-[10px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2.5 py-2">Order Name</th>
                <th className="px-2.5 py-2">Style Name</th>
                <th className="px-2.5 py-2">Brand</th>
                <th className="px-2.5 py-2">Category</th>
                <th className="px-2.5 py-2">Subcategory</th>
                <th className="px-2.5 py-2">Item</th>
                {takingFromStock && <th className="px-2.5 py-2">Stock Source</th>}
                <th className="px-2.5 py-2">Internal Consumption</th>
                <th className="px-2.5 py-2 text-right">Remaining Qty</th>
                <th className="px-2.5 py-2 text-right">{takingFromStock ? "Booked Qty" : "Grouped Qty"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-2.5 py-2 font-semibold text-slate-800">
                    {text(row.orderNo)}
                  </td>
                  <td className="px-2.5 py-2">{text(row.styleName)}</td>
                  <td className="px-2.5 py-2">{text(row.brand)}</td>
                  <td className="px-2.5 py-2">{text(row.category)}</td>
                  <td className="px-2.5 py-2">{text(row.subCategory)}</td>
                  <td className="px-2.5 py-2 font-semibold text-slate-900">
                    {text(row.itemName)}
                  </td>
                  {takingFromStock && <td className="min-w-56 px-2.5 py-2">
                    {stockOptionsFor(row).length > 1 ? <Select
                      aria-label={`Select stock location for ${text(row.itemName)}`}
                      value={stockIds[row.id] ?? ""}
                      onChange={(event) => {
                        const stock = stockOptionsFor(row).find((item) => item.id === event.target.value);
                        setStockIds((current) => ({ ...current, [row.id]: event.target.value }));
                        if (stock) setLines((current) => ({ ...current, [row.id]: String(Math.min(Number(row.remainingQty ?? row.requiredQty ?? 0), availableQty(stock))) }));
                      }}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-emerald-500"
                    ><option value="">Select stock location</option>{stockOptionsFor(row).map((stock) => <option key={stock.id} value={stock.id}>{stock.location.location_name} · available {formatNumber(availableQty(stock))}</option>)}</Select>
                      : selectedStockFor(row) ? <span>{selectedStockFor(row)!.location.location_name} · {formatNumber(availableQty(selectedStockFor(row)!))} available</span>
                        : <span className="text-amber-700">No available stock</span>}
                  </td>}
                  <td className="px-2.5 py-2">
                    {formatNumber(row.internalConsumption)}
                  </td>
                  <td className="px-2.5 py-2 text-right font-bold">
                    {formatNumber(row.remainingQty ?? row.requiredQty)}
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <Input
                      aria-label={`${takingFromStock ? "Booked" : "Grouped"} quantity for ${text(row.orderNo)}`}
                      type="number"
                      min="0"
                      max={takingFromStock ? (selectedStockFor(row) ? Math.min(Number(row.remainingQty ?? row.requiredQty ?? 0), availableQty(selectedStockFor(row)!)) : 0) : row.remainingQty ?? row.requiredQty ?? undefined}
                      step="0.01"
                      value={lines[row.id] ?? ""}
                      onChange={(event) => updateQty(row, event.target.value)}
                      disabled={takingFromStock && !selectedStockFor(row)}
                      className="w-28 rounded border border-slate-300 px-2 py-1 text-right outline-none focus:border-emerald-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-xs font-semibold text-slate-600"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={submitting || (takingFromStock ? (!currentStoreVendor || stockLoading || invalidStockLines || noStockQuantity) : !vendorId)}
            onClick={submit}
            className="rounded-md px-4 py-2 text-xs font-bold"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{" "}
            {takingFromStock ? "Book Stock" : "Submit grouped PO"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PriceApprovalStage({
  groupedPurchaseOrders,
  gstOptions,
  loading,
  organizationId,
  onUpdated,
  onApproved,
  onError,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  groupedPurchaseOrders: GroupedPurchaseOrder[];
  gstOptions: GstOption[];
  loading: boolean;
  organizationId: string;
  onUpdated: () => Promise<void>;
  onApproved: () => void;
  onError: (message: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const priceApprovalPath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${params?.organizationId ?? organizationId}/order-management/procurement/create-po/style-wise/approve-price`;
  const [approving, setApproving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const approvedOrders = groupedPurchaseOrders.filter(
    (item) => item.status === "PRICE_APPROVED",
  );
  const masterGroupEligibleOrders = approvedOrders;
  const selectedOrder = masterGroupEligibleOrders.find((item) => selectedIds.has(item.id));
  const selectedSourceType = selectedOrder ? selectedOrder.sourceType ?? "VENDOR" : null;
  const approveSelectedRecords = async () => {
    setApproving(true);
    try {
      const response = await fetch(
        `/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            action: "master-group",
            groupedPurchaseOrderIds: masterGroupEligibleOrders
              .filter((item) => selectedIds.has(item.id))
              .map((item) => item.id),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error || "Unable to master group the selected records.",
        );
      setSelectedIds(new Set());
      await onUpdated();
      onApproved();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to master group the selected records.",
      );
    } finally {
      setApproving(false);
    }
  };
  const approveRecord = async (order: GroupedPurchaseOrder) => {
    setApprovingId(order.id);
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId, action: "approve" }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error || `Unable to approve ${order.groupedPoNo}.`,
        );
      await onUpdated();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to approve grouped PO.",
      );
    } finally {
      setApprovingId(null);
    }
  };
  const deleteRecord = async (order: GroupedPurchaseOrder) => {
    const deleteEffects = order.sourceType === "STOCK"
      ? " Its reserved stock will be released and its booking history retained."
      : " Its grouped subform records will also be deleted.";
    if (
      !window.confirm(
        `Delete Grouped PO ${order.groupedPoNo}?${deleteEffects}`,
      )
    )
      return;
    setDeletingId(order.id);
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}?organizationId=${encodeURIComponent(organizationId)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error || `Unable to delete ${order.groupedPoNo}.`,
        );
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
      await onUpdated();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to delete grouped PO.",
      );
    } finally {
      setDeletingId(null);
    }
  };
  if (loading)
    return (
      <div className="erp-surface flex min-h-40 items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading
        price approvals
      </div>
    );
  const selectedCount = masterGroupEligibleOrders.filter((item) =>
    selectedIds.has(item.id),
  ).length;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">
            Review grouped material prices
          </h2>
        </div>
        <button
          type="button"
          disabled={approving || selectedCount < 1}
          onClick={approveSelectedRecords}
          className="rounded-md bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {approving
            ? "Creating master group..."
            : `Master Group${selectedCount ? ` (${selectedCount})` : ""}`}
        </button>
      </div>
      {groupedPurchaseOrders.length === 0 ? (
        <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">
          No grouped POs are available for price approval or Master Grouping.
        </div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1350px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3">Select</th>
                  <th className="px-3 py-3">Grouped PO</th>
                  <th className="px-3 py-3">Raw material</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Sourcing</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3">Stock UOM</th>
                  <th className="px-3 py-3">Buying UOM</th>
                  <th className="px-3 py-3 text-right">GST</th>
                  <th className="px-3 py-3">HSN code</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedPurchaseOrders.map((order) => {
                  const pending = order.status === "PENDING_PRICE_APPROVAL";
                  const approved = order.status === "PRICE_APPROVED";
                  const selected = selectedIds.has(order.id);
                  const firstLine = order.lines[0];
                  const price = Number(
                    order.vendorPriceInr ??
                      order.vendorPrice ??
                      firstLine?.vendorPrice ??
                      0,
                  );
                  const quantity = Number(
                    order.totalGroupedQty ??
                      order.lines.reduce(
                        (total, line) => total + Number(line.groupedQty ?? 0),
                        0,
                      ),
                  );
                  const total = order.lines.reduce(
                    (sum, line) =>
                      sum +
                      Number(
                        line.total ??
                          Number(line.groupedQty ?? 0) *
                            Number(line.vendorPrice ?? price),
                      ),
                    0,
                  );
                  const gst =
                    order.gst !== null && order.gst !== undefined
                      ? text(order.gst)
                      : [
                          ...new Set(
                            order.lines.map((line) => text(line.gst, "-")),
                          ),
                        ].join(", ");
                  const hsn = order.hsnCode
                    ? text(order.hsnCode)
                    : [
                        ...new Set(
                          order.lines.map((line) => text(line.hsnCode, "-")),
                        ),
                      ].join(", ");
                  return (
                    <tr
                      key={order.id}
                      onClick={() =>
                        router.push(
                          `${priceApprovalPath}/${encodeURIComponent(order.id)}`,
                        )
                      }
                      className="cursor-pointer bg-white transition hover:bg-blue-50"
                    >
                      <td
                        className="px-3 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${order.groupedPoNo}`}
                          disabled={!approved || (selectedSourceType !== null && selectedSourceType !== (order.sourceType ?? "VENDOR"))}
                          checked={selected}
                          onChange={() =>
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (next.has(order.id)) next.delete(order.id);
                              else next.add(order.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-900">
                        {order.groupedPoNo}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800">
                        {text(order.rawMaterial)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {order.vendor.name}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded px-2 py-1 text-[9px] font-bold ${order.sourceType === "STOCK" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                          {order.sourceType === "STOCK" ? "Inventory" : "Supplier PO"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-[9px] font-bold ${pending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                        >
                          {pending
                            ? "Pending price"
                            : approved
                              ? "Price approved"
                              : "Master grouped"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-700">
                        {formatNumber(price)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {formatNumber(quantity)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {text(order.stockUom ?? firstLine?.stockUom)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {text(order.buyingUom)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {gst}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{hsn}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">
                        {formatNumber(total)}
                      </td>
                      <td
                        className="px-3 py-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-center gap-2">
                          {pending ? (
                            <button
                              type="button"
                              disabled={approvingId === order.id}
                              onClick={() => approveRecord(order)}
                              className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                            >
                              {approvingId === order.id
                                ? "Approving..."
                                : "Approve price"}
                            </button>
                          ) : approved ? (
                            <span className="text-[10px] font-semibold text-emerald-700">
                              {order.sourceType === "STOCK" ? "Stock cost approved" : "Ready for Master Group"}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-500">
                              Master grouped
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={deletingId === order.id}
                            onClick={() => void deleteRecord(order)}
                            aria-label={`Delete ${order.groupedPoNo}`}
                            title="Delete Grouped PO"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === order.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void onLoadMore()}>
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {loadingMore ? "Loading grouped POs" : "Load more grouped POs"}
          </Button>
        </div>
      )}
    </section>
  );
}

function MasterPurchaseOrderReport({
  masterPurchaseOrders,
  onUpdated,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  masterPurchaseOrders: MasterPurchaseOrder[];
  onUpdated: () => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
}) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const detailPath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${params?.organizationId ?? "demo-org"}/order-management/procurement/create-po/style-wise/create-po/master-group`;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [deletionError, setDeletionError] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const [activeTab, setActiveTab] = useState("po-creation");
  const [poDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryDate] = useState(() =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const toggleMaster = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const deleteMaster = async (master: MasterPurchaseOrder) => {
    const deletionEffects = master.sourceType === "STOCK"
      ? " Its Store notification, GRN verification, and allocations will also be deleted. Verified stock will be restored if it has not since been used or reserved, and source groups will return to price approval."
      : " Its subform records will also be deleted.";
    if (
      !window.confirm(
        `Delete Master Group ${master.masterPoNo}?${deletionEffects}`,
      )
    )
      return;
    setDeletingId(master.id);
    setDeletionError("");
    try {
      const response = await fetch(
        `/api/orders/procurement/master/${encodeURIComponent(master.id)}?organizationId=${encodeURIComponent(params?.organizationId ?? "demo-org")}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to delete Master Group.");
      setDeletedIds((current) => new Set(current).add(master.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(master.id);
        return next;
      });
      try {
        await onUpdated();
      } catch {
        setDeletionError("Master Group was deleted, but the procurement list could not be refreshed.");
      }
    } catch (error) {
      setDeletionError(
        error instanceof Error
          ? error.message
          : "Unable to delete Master Group.",
      );
    } finally {
      setDeletingId(null);
    }
  };
  const notifyStore = async (master: MasterPurchaseOrder) => {
    setNotifyingId(master.id);
    setNotificationError("");
    try {
      const organizationId = params?.organizationId ?? "demo-org";
      const response = await fetch(`/api/orders/procurement/master/${encodeURIComponent(master.id)}?organizationId=${encodeURIComponent(organizationId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "notify-store" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to notify the Internal Store.");
      await onUpdated();
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Unable to notify the Internal Store.");
    } finally {
      setNotifyingId(null);
    }
  };
  const visibleMasters = masterPurchaseOrders.filter(
    (master) => !deletedIds.has(master.id) && (master.sourceType === "STOCK" || !master.purchaseOrderCreated),
  );
  const tabMasters = visibleMasters.filter((master) =>
    activeTab === "notify-store"
      ? master.sourceType === "STOCK"
      : master.sourceType === "VENDOR",
  );
  const generatePurchaseOrders = async () => {
    setGenerating(true);
    setGenerationError("");
    try {
      const organizationId = params?.organizationId ?? "demo-org";
      const response = await fetch("/api/orders/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          masterPurchaseOrderIds: [...selectedIds],
          poDate,
          deliveryDate,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to generate Purchase Orders.");
      router.push(
        `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/order-management/procurement/purchase-order`,
      );
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Unable to generate Purchase Orders.",
      );
    } finally {
      setGenerating(false);
    }
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
            Stage 3
          </p>
          <h2 className="text-sm font-bold text-slate-950">
            Create purchase order
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Vendor groups generate Purchase Orders. Stock groups are sent to the Internal Store for verification.
          </p>
        </div>
        {activeTab === "po-creation" && (
          <button
            type="button"
            onClick={generatePurchaseOrders}
            disabled={generating || selectedIds.size === 0}
            className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {generating
              ? "Generating..."
              : `Generate Purchase Order${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
          </button>
        )}
      </div>
      <Tabs
        tabs={[
          { label: "PO Creation", value: "po-creation" },
          { label: "Notify Store", value: "notify-store" },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Purchase order actions"
      />
      {generationError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {generationError}
        </div>
      )}
      {deletionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {deletionError}
        </div>
      )}
      {notificationError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {notificationError}
        </div>
      )}
      {tabMasters.length === 0 ? (
          <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">
          {activeTab === "notify-store"
            ? "No stock Master Groups are ready for store notification."
            : "No vendor Master Groups are ready for PO creation."}
        </div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3">Select</th>
                  <th className="px-3 py-3">Master Group</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Raw material</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3">Stock UOM</th>
                  <th className="px-3 py-3">Buying UOM</th>
                  <th className="px-3 py-3 text-right">GST</th>
                  <th className="px-3 py-3">HSN code</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tabMasters.map((master) => (
                  <tr
                    key={master.id}
                    onClick={() =>
                      router.push(
                        `${detailPath}/${encodeURIComponent(master.id)}`,
                      )
                    }
                    className="cursor-pointer bg-white transition hover:bg-emerald-50"
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {master.sourceType === "VENDOR" && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${master.masterPoNo}`}
                          checked={selectedIds.has(master.id)}
                          onChange={() => toggleMaster(master.id)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-900">
                      {master.masterPoNo}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{master.entityName || "Missing Entity"}</td>
                    <td className="px-3 py-3">{master.sourceType === "STOCK" ? "Stock" : "Vendor"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {text(master.rawMaterial)}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {master.vendor.name}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-700">
                      {text(master.price)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatNumber(master.totalGroupedQty)}
                    </td>
                    <td className="px-3 py-3">
                      {text(master.lines[0]?.stockUom)}
                    </td>
                    <td className="px-3 py-3">{text(master.buyingUom)}</td>
                    <td className="px-3 py-3 text-right">{text(master.gst)}</td>
                    <td className="px-3 py-3">{text(master.hsnCode)}</td>
                    <td className="px-3 py-3 text-right font-bold">
                      {formatNumber(master.total)}
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {master.status === "STORE_NOTIFIED"
                        ? "Awaiting Store Verification"
                        : master.status === "STOCK_ALLOCATED"
                          ? "Stock Allocated"
                          : master.status === "MASTER_GROUPED"
                            ? master.sourceType === "STOCK" ? "Ready to notify Store" : "Ready for PO"
                            : master.status}
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        {master.sourceType === "STOCK" && (master.status === "MASTER_GROUPED" ? (
                          <Button type="button" size="sm" disabled={notifyingId === master.id || deletingId === master.id} onClick={() => void notifyStore(master)}>
                            {notifyingId === master.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />}
                            Notify Store
                          </Button>
                        ) : (
                          <span className="text-slate-500">{master.status === "STORE_NOTIFIED" ? "Store notified" : "Completed"}</span>
                        ))}
                        <button
                          type="button"
                          disabled={deletingId === master.id || notifyingId === master.id}
                          onClick={() => void deleteMaster(master)}
                          aria-label={`Delete ${master.masterPoNo}`}
                          title={master.sourceType === "STOCK" ? "Delete Master Group and linked Store records" : "Delete Master Group"}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === master.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void onLoadMore()}>
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {loadingMore ? "Loading Master Groups" : "Load more Master Groups"}
          </Button>
        </div>
      )}
    </section>
  );
}

function CreatePoStage({
  masterPurchaseOrders,
}: {
  masterPurchaseOrders: MasterPurchaseOrder[];
}) {
  const approvedOrders: GroupedPurchaseOrder[] = [];
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
          Stage 3
        </p>
        <h2 className="text-sm font-bold text-slate-950">
          Create purchase order
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Approved grouped records and master groups are ready to become
          purchase orders.
        </p>
      </div>
      {masterPurchaseOrders.map((master) => (
        <div key={master.id} className="erp-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-blue-50 px-4 py-3">
            <div>
              <p className="text-xs font-bold text-slate-950">
                {master.masterPoNo}
              </p>
              <p className="text-[10px] text-slate-600">
                Master group · {master.vendor.name} ·{" "}
                {master.sourceGroupedPoIds.length} grouped records
              </p>
            </div>
            <span className="text-xs font-bold text-blue-700">
              {formatNumber(master.totalGroupedQty)} qty
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-[10px]">
              <thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Source Grouped PO</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Style</th>
                  <th className="px-3 py-2 text-right">Grouped Qty</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {master.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-semibold">
                      {text(line.sourceGroupedPoNo)}
                    </td>
                    <td className="px-3 py-2">{text(line.sourceOrderNo)}</td>
                    <td className="px-3 py-2">{text(line.styleName)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(line.groupedQty)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatNumber(line.totalSpend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {approvedOrders.length === 0 ? (
        <div className="erp-surface flex min-h-40 items-center justify-center text-xs text-slate-500">
          {masterPurchaseOrders.length === 0
            ? "No approved grouped records are ready for PO creation."
            : "No individual grouped records are ready for PO creation."}
        </div>
      ) : (
        <div className="erp-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Grouped PO</th>
                  <th className="px-3 py-3">Entity</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Raw Material</th>
                  <th className="px-3 py-3 text-right">Grouped Qty</th>
                  <th className="px-3 py-3 text-right">Lines</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {approvedOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-emerald-50/40">
                    <td className="px-3 py-3 font-bold text-slate-900">
                      {order.groupedPoNo}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{order.entityName || "Missing Entity"}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {order.vendor.name}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {text(order.rawMaterial)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold">
                      {formatNumber(order.totalGroupedQty)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {order.lines.length}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-800">
                        Price approved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function DetailedPriceApprovalCard({
  order,
  gstOptions,
  organizationId,
  onUpdated,
  onError,
}: {
  order: GroupedPurchaseOrder;
  gstOptions: GstOption[];
  organizationId: string;
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [vendorPriceInr, setVendorPriceInr] = useState(
    String(order.vendorPriceInr ?? order.vendorPrice ?? ""),
  );
  const [gst, setGst] = useState(String(order.gst ?? ""));
  const [gstMasterId, setGstMasterId] = useState(
    () =>
      gstOptions.find(
        (option) =>
          Number(option.fields?.Gst ?? option.fields?.gst) ===
          Number(order.gst),
      )?.id ?? "",
  );
  const [uomConvertOptions, setUomConvertOptions] = useState<
    UomConvertOption[]
  >([]);
  const [buyingUom, setBuyingUom] = useState(order.buyingUom ?? "");
  const [convertValue, setConvertValue] = useState(
    String(order.convertValue ?? ""),
  );
  const [hsnCode, setHsnCode] = useState(order.hsnCode ?? "");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showTax, setShowTax] = useState(false);

  useEffect(() => {
    if (
      gstMasterId ||
      !gstOptions.length ||
      order.gst === null ||
      order.gst === undefined
    )
      return;
    const matchingOption = gstOptions.find(
      (option) =>
        Number(option.fields?.Gst ?? option.fields?.gst) === Number(order.gst),
    );
    if (matchingOption) setGstMasterId(matchingOption.id);
  }, [gstMasterId, gstOptions, order.gst]);

  useEffect(() => {
    const loadUomConversions = async () => {
      try {
        const [uomResponse, conversionResponse] = await Promise.all([
          fetch(
            `/api/organizations/${encodeURIComponent(organizationId)}/master-data/uom?includeInactive=false`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/organizations/${encodeURIComponent(organizationId)}/master-data/stock-uom-convert?includeInactive=false`,
            { cache: "no-store" },
          ),
        ]);
        const uomOptions = await uomResponse.json();
        const conversionOptions = await conversionResponse.json();
        if (!uomResponse.ok || !conversionResponse.ok)
          throw new Error("Unable to load UOM conversions.");
        const stockUom = String(
          order.stockUom ?? order.lines[0]?.stockUom ?? "",
        )
          .trim()
          .toLowerCase();
        const stockUomRecord = (
          Array.isArray(uomOptions) ? uomOptions : []
        ).find(
          (option: UomConvertOption) =>
            String(option.label ?? "")
              .trim()
              .toLowerCase() === stockUom,
        );
        const matchingConversions = (
          Array.isArray(conversionOptions) ? conversionOptions : []
        ).filter(
          (option: UomConvertOption) =>
            option.parent_id === stockUomRecord?.id ||
            option.parent_id === stockUomRecord?.value_id,
        );
        setUomConvertOptions(matchingConversions);
      } catch (loadError) {
        setActionError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load UOM conversions.",
        );
      }
    };
    void loadUomConversions();
  }, [organizationId, order.lines, order.stockUom]);

  const savePrice = async () => {
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            action: "update-header",
            vendorPriceInr,
            vendorPrice: vendorPriceInr,
            gst,
            gstMasterId,
            hsnCode,
            buyingUom,
            convertValue,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update grouped PO.");
      await onUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update grouped PO.";
      setActionError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  const headerTotalQty = Number(
    order.totalGroupedQty ??
      order.lines.reduce(
        (total, line) => total + Number(line.groupedQty ?? 0),
        0,
      ),
  );
  const buyingQty =
    Number(convertValue) > 0 ? headerTotalQty / Number(convertValue) : 0;
  const headerTotal = order.lines.reduce(
    (sum, line) =>
      sum +
      Number(line.groupedQty ?? 0) *
        Number(vendorPriceInr || line.vendorPrice || 0),
    0,
  );

  /*

  return <div className="erp-surface overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-xs font-bold text-slate-950">{order.groupedPoNo}</p><p className="text-[10px] text-slate-500">{order.vendor.name} · {order.lines.length} raw-material lines · {new Date(order.submittedAt).toLocaleDateString()}</p></div><span className="text-xs font-bold text-emerald-700">{formatNumber(order.totalGroupedQty ?? order.lines.reduce((total, line) => total + Number(line.groupedQty ?? 0), 0))} qty</span></div><div className="space-y-4 p-4"><div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Vendor" value={order.vendor.name} readOnly /><Field label="Raw material" value={text(order.rawMaterial)} readOnly /><Field label="Category / subcategory" value={`${text(order.category)} / ${text(order.subCategory)}`} readOnly /><Field label="No. of styles" value={String(order.noOfStyles ?? order.lines.length)} readOnly /><Field label="Vendor Price INR" value={vendorPriceInr} onChange={setVendorPriceInr} /></div>{actionError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}<div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-left text-[10px]"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Grouping / Order</th><th className="px-2 py-2">Style</th><th className="px-2 py-2">Raw material</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Buying Qty</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2 text-right">GST</th><th className="px-2 py-2">HSN Code</th><th className="px-2 py-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{order.lines.map((line) => <tr key={line.id}><td className="px-2 py-2 font-semibold text-slate-800">{text(line.orderNo)}</td><td className="px-2 py-2">{text(line.styleName)}</td><td className="px-2 py-2 font-semibold text-slate-900">{text(line.itemName)}</td><td className="px-2 py-2 text-right">{formatNumber(line.groupedQty)}</td><td className="px-2 py-2 text-right">{formatNumber(Number(convertValue) > 0 ? Number(line.groupedQty ?? 0) / Number(convertValue) : 0)}</td><td className="px-2 py-2 text-right font-bold text-emerald-700">{formatNumber(Number(vendorPriceInr || line.vendorPrice || 0))}</td><td className="px-2 py-2 text-right">{text(line.gst)}</td><td className="px-2 py-2">{text(line.hsnCode)}</td><td className="px-2 py-2 text-right font-bold">{formatNumber(line.total ?? (Number(line.groupedQty ?? 0) * Number(vendorPriceInr || line.vendorPrice || 0)))}</td></tr>)}</tbody></table></div><div className="flex justify-end"><button type="button" disabled={saving} onClick={savePrice} className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{saving ? "Saving..." : "Save price"}</button></div></div></div>;
  const headerGst = [...new Set(order.lines.map((line) => text(line.gst, "-")))].join(", ");
  const headerHsn = [...new Set(order.lines.map((line) => text(line.hsnCode, "-")))].join(", ");
  const headerTotal = order.lines.reduce((sum, line) => sum + Number(line.total ?? (Number(line.groupedQty ?? 0) * Number(vendorPriceInr || line.vendorPrice || 0))), 0);

  return <div className="erp-surface overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-xs font-bold text-slate-950">{order.groupedPoNo}</p><p className="text-[10px] text-slate-500">{order.vendor.name} · {order.lines.length} raw-material lines · {new Date(order.submittedAt).toLocaleDateString()}</p></div><span className="text-xs font-bold text-emerald-700">{formatNumber(order.totalGroupedQty ?? order.lines.reduce((total, line) => total + Number(line.groupedQty ?? 0), 0))} qty</span></div><div className="space-y-4 p-4"><div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Vendor" value={order.vendor.name} readOnly /><Field label="Raw material" value={text(order.rawMaterial)} readOnly /><Field label="Category / subcategory" value={`${text(order.category)} / ${text(order.subCategory)}`} readOnly /><Field label="No. of styles" value={String(order.noOfStyles ?? order.lines.length)} readOnly /><Field label="Vendor Price INR" value={vendorPriceInr} onChange={setVendorPriceInr} /><ReadOnlyValue label="GST" value={headerGst} /><ReadOnlyValue label="HSN Code" value={headerHsn} /><ReadOnlyValue label="Total" value={formatNumber(headerTotal)} /></div>{actionError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}

  */
  const selectedGst = gstOptions.find((option) => option.id === gstMasterId);
  const gstRate = Number(
    selectedGst?.fields?.Gst ?? selectedGst?.fields?.gst ?? gst ?? 0,
  );
  const cgstRate = Number(
    selectedGst?.fields?.Cgst_Rate ??
      selectedGst?.fields?.cgst_rate ??
      gstRate / 2,
  );
  const sgstRate = Number(
    selectedGst?.fields?.Sgst_Rate ??
      selectedGst?.fields?.sgst_rate ??
      gstRate / 2,
  );
  const igstRate = Number(
    selectedGst?.fields?.Igst_Rate ?? selectedGst?.fields?.igst_rate ?? gstRate,
  );
  const sameState = Boolean(
    registrationStateCode(order.organizationState, order.organizationGstin) &&
    registrationStateCode(order.organizationState, order.organizationGstin) ===
      registrationStateCode(order.vendor.registeredState, order.vendor.gstin),
  );
  const applicableCgstRate = sameState ? cgstRate : 0;
  const applicableSgstRate = sameState ? sgstRate : 0;
  const applicableIgstRate = sameState ? 0 : igstRate;
  const cgstAmount = (headerTotal * applicableCgstRate) / 100;
  const sgstAmount = (headerTotal * applicableSgstRate) / 100;
  const igstAmount = (headerTotal * applicableIgstRate) / 100;
  const totalTax = cgstAmount + sgstAmount + igstAmount;
  return (
    <div className="erp-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Entity" value={order.entityName || "Missing Entity"} readOnly />
        <Field label="Vendor" value={order.vendor.name} readOnly />
        <Field label="Raw material" value={text(order.rawMaterial)} readOnly />
        <Field
          label="Vendor Price INR"
          value={vendorPriceInr}
          onChange={setVendorPriceInr}
        />
        <Field
          label="Stock UOM"
          value={text(order.stockUom ?? order.lines[0]?.stockUom)}
          disabled
        />
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Buying UOM lookup
          </span>
          <select
            value={buyingUom}
            onChange={(event) => {
              const option = uomConvertOptions.find(
                (item) => item.label === event.target.value,
              );
              setBuyingUom(event.target.value);
              setConvertValue(
                String(
                  option?.fields?.How_Many ?? option?.fields?.how_many ?? "",
                ),
              );
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">Select buying UOM</option>
            {uomConvertOptions.map((option) => (
              <option key={option.id} value={option.label}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Field label="Convert Value" value={convertValue} disabled />
        <Field label="Buying Qty" value={formatNumber(buyingQty)} disabled />
        <label className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={showTax}
            onChange={(event) => setShowTax(event.target.checked)}
          />{" "}
          Show tax
        </label>
        <label>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
            GST lookup
          </span>
          <select
            value={gstMasterId}
            onChange={(event) => {
              const option = gstOptions.find(
                (item) => item.id === event.target.value,
              );
              setGstMasterId(event.target.value);
              setGst(String(option?.fields?.Gst ?? option?.fields?.gst ?? ""));
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">Select GST</option>
            {gstOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} (
                {String(option.fields?.Gst ?? option.fields?.gst ?? "-")}%)
              </option>
            ))}
          </select>
        </label>
        {showTax && (
          <>
            <ReadOnlyValue
              label="CGST"
              value={`${applicableCgstRate}% (${formatNumber(cgstAmount)})`}
            />
            <ReadOnlyValue
              label="SGST"
              value={`${applicableSgstRate}% (${formatNumber(sgstAmount)})`}
            />
            <ReadOnlyValue
              label="IGST"
              value={`${applicableIgstRate}% (${formatNumber(igstAmount)})`}
            />
            <ReadOnlyValue label="Total tax" value={formatNumber(totalTax)} />
          </>
        )}
        <Field label="HSN Code" value={hsnCode} onChange={setHsnCode} />
        <ReadOnlyValue label="Total Qty" value={formatNumber(headerTotalQty)} />
        <ReadOnlyValue label="Total" value={formatNumber(headerTotal)} />
      </div>
      {actionError && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {actionError}
        </div>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-[10px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Grouping / Order</th>
              <th className="px-2 py-2">Style</th>
              <th className="px-2 py-2">Raw material</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Buying Qty</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">GST</th>
              <th className="px-2 py-2">HSN Code</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-2 py-2 font-semibold text-slate-800">
                  {text(line.orderNo)}
                </td>
                <td className="px-2 py-2">{text(line.styleName)}</td>
                <td className="px-2 py-2 font-semibold text-slate-900">
                  {text(line.itemName)}
                </td>
                <td className="px-2 py-2 text-right">
                  {formatNumber(line.groupedQty)}
                </td>
                <td className="px-2 py-2 text-right">
                  {formatNumber(
                    Number(convertValue) > 0
                      ? Number(line.groupedQty ?? 0) / Number(convertValue)
                      : 0,
                  )}
                </td>
                <td className="px-2 py-2 text-right font-bold text-emerald-700">
                  {formatNumber(
                    Number(vendorPriceInr || line.vendorPrice || 0),
                  )}
                </td>
                <td className="px-2 py-2 text-right">{text(gst)}</td>
                <td className="px-2 py-2">{text(hsnCode)}</td>
                <td className="px-2 py-2 text-right font-bold">
                  {formatNumber(
                    Number(line.groupedQty ?? 0) *
                      Number(vendorPriceInr || line.vendorPrice || 0),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={savePrice}
          className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save price"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
  disabled,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <Input
      label={label}
      readOnly={readOnly}
      disabled={disabled}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      className="rounded"
    />
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="rounded border border-slate-300 bg-slate-100 px-2 py-1.5 text-xs text-slate-600">
        {value}
      </div>
    </div>
  );
}

function SummaryField({
  label,
  value,
}: {
  label: string;
  value?: number | null;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-900">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function PriceApprovalCard({
  order,
  expanded,
  onToggle,
  organizationId,
  onUpdated,
  onError,
}: {
  order: GroupedPurchaseOrder;
  expanded: boolean;
  onToggle: () => void;
  organizationId: string;
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [lines, setLines] = useState<GroupedLine[]>(() =>
    order.lines.map((line) => ({
      ...line,
      groupedQty: String(line.groupedQty ?? ""),
      vendorPrice: String(line.vendorPrice ?? ""),
    })),
  );
  const [saving, setSaving] = useState(false);
  const updatePrice = (id: string, value: string) =>
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, vendorPrice: value } : line,
      ),
    );
  const action = async (type: "save-prices" | "approve" | "reject") => {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/orders/procurement/${encodeURIComponent(order.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            action: type,
            prices: lines.map((line) => ({
              lineId: line.id,
              vendorPrice: line.vendorPrice,
            })),
            reason:
              type === "reject" ? "Price requires correction." : undefined,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Unable to update price approval.");
      await onUpdated();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to update price approval.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="erp-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          <span className="min-w-0">
            <span className="block text-xs font-bold text-slate-950">
              {order.groupedPoNo}
            </span>
            <span className="block text-[10px] text-slate-500">
              {order.vendor.name} · {order.lines.length} lines · submitted{" "}
              {new Date(order.submittedAt).toLocaleDateString()}
            </span>
          </span>
        </span>
        <span className="text-xs font-bold text-emerald-700">
          {formatNumber(
            order.lines.reduce(
              (total, line) => total + Number(line.groupedQty ?? 0),
              0,
            ),
          )}{" "}
          qty
        </span>
      </button>
      {expanded && (
        <div className="border-t border-slate-200 p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-[10px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Order / Style</th>
                  <th className="px-2 py-2">Brand</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2 text-right">Grouped Qty</th>
                  <th className="px-2 py-2 text-right">Vendor Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-2 py-2 font-semibold text-slate-800">
                      {text(line.orderNo)} / {text(line.styleName)}
                    </td>
                    <td className="px-2 py-2">{text(line.brand)}</td>
                    <td className="px-2 py-2">
                      {text(line.category)} / {text(line.subCategory)}
                    </td>
                    <td className="px-2 py-2 font-semibold text-slate-900">
                      {text(line.itemName)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {formatNumber(
                        line.groupedQty ? Number(line.groupedQty) : 0,
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.vendorPrice}
                        onChange={(event) =>
                          updatePrice(line.id, event.target.value)
                        }
                        className="w-28 rounded border border-slate-300 px-2 py-1 text-right outline-none focus:border-blue-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => action("save-prices")}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Save prices
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => action("approve")}
              className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              Approve price
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => action("reject")}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
