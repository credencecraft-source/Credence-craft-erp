"use client";

import { ArrowLeft, Check, ChevronDown, ClipboardCheck, Loader2, PackageSearch, Search, Store, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { text } from "./style-wise-purchase-order-format";
import type { BomRow, VendorOption, GstOption, MaterialGroup, MaterialCategory, GroupedPurchaseOrder, MasterPurchaseOrder, StyleWiseStage } from "./style-wise-purchase-order-types";
import { MaterialCategoryCard, MaterialGroupCard, MaterialDetail, StageButton, GroupedPurchaseOrderForm } from "./style-wise-purchase-order-allocation";
import { PriceApprovalStage } from "./style-wise-purchase-order-approval";
import { MasterPurchaseOrderReport } from "./style-wise-purchase-order-create";
import Input from "@/components/ui/Input";


export type { GroupedPurchaseOrder, MasterPurchaseOrder, StyleWiseStage } from "./style-wise-purchase-order-types";
export { DetailedPriceApprovalCard } from "./style-wise-purchase-order-detail-card";
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

  const loadAllocatableRows = useCallback(async (append = false) => {
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
  }, [allocationNextCursor, organizationId]);

  const loadMoreAllocatableRows = useCallback(async () => {
    if (!allocationNextCursor || loadingMoreAllocation) return;
    setLoadingMoreAllocation(true);
    try {
      await loadAllocatableRows(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more raw-material rows.");
    } finally {
      setLoadingMoreAllocation(false);
    }
  }, [allocationNextCursor, loadAllocatableRows, loadingMoreAllocation]);

  const loadVendors = useCallback(async () => {
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
  }, [organizationId]);

  const loadGstOptions = useCallback(async () => {
    const response = await fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/master-data/gst?includeInactive=false`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data?.error || "Unable to load GST master.");
    setGstOptions(Array.isArray(data) ? data : []);
    loadedStageData.current.add(`${organizationId}:gst`);
  }, [organizationId]);

  const loadPriceApprovals = useCallback(async (appendDataset?: "grouped" | "master", requestedView?: "price-approval" | "create") => {
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
  }, [groupedNextCursor, masterNextCursor, organizationId, stage]);

  const loadOnce = useCallback((key: string, loader: () => Promise<void>) => {
    const cacheKey = `${organizationId}:${key}`;
    if (loadedStageData.current.has(cacheKey)) return Promise.resolve();
    const existing = stageDataRequests.current.get(cacheKey);
    if (existing) return existing;
    const request = loader()
      .then(() => { loadedStageData.current.add(cacheKey); })
      .finally(() => stageDataRequests.current.delete(cacheKey));
    stageDataRequests.current.set(cacheKey, request);
    return request;
  }, [organizationId]);

  const loadStageData = useCallback((targetStage: StyleWiseStage) => {
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
  }, [loadAllocatableRows, loadGstOptions, loadOnce, loadPriceApprovals, loadVendors, organizationId]);

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
  }, [loadStageData, organizationId, stage]);

  useEffect(() => {
    if (stage !== "price" && stage !== "create") return;
    let mounted = true;
    loadStageData(stage)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load price approvals."))
      .finally(() => {
        if (mounted) setPriceLoading(false);
      });
    return () => { mounted = false; };
  }, [loadStageData, stage, organizationId]);

  useEffect(() => {
    const syncStageFromHistory = () => {
      if (window.location.pathname === styleWisePath) setStage("allocate");
      else if (window.location.pathname === `${styleWisePath}/approve-price`) setStage("price");
      else if (window.location.pathname === `${styleWisePath}/create-po`) setStage("create");
    };
    window.addEventListener("popstate", syncStageFromHistory);
    return () => window.removeEventListener("popstate", syncStageFromHistory);
  }, [styleWisePath]);

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
  const toggleRow = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          <Button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </Button>
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
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search material or subcategory"
                  className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs outline-none focus:border-emerald-500"
                />
              </div>
              {selectedMaterial && (
                <Button
                  type="button"
                  onClick={() => setShowGroupedForm(true)}
                  disabled={selectedRows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Store className="h-3.5 w-3.5" /> Allocate vendor{" "}
                  <span className="rounded bg-white/20 px-1.5">
                    {selectedRows.length}
                  </span>
                </Button>
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
                <Button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryKey(null);
                    setSearch("");
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Categories
                </Button>
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
