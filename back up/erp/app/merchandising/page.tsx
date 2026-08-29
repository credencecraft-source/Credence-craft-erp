"use client";

import AppShell from "../components/AppShell";
import OrderEntryForm from "../components/OrderEntryForm";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const workAreas = ["Orders", "Order Booking Summary", "Samples", "BOM"] as const;
type WorkArea = (typeof workAreas)[number];
const statuses = ["Draft", "Waiting for Approval", "Approved", "In Production"] as const;
type Status = (typeof statuses)[number];

type OrderRecord = {
  id: string;
  organizationId?: string | null;
  tenantId?: string | null;
  entityName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  season?: string | null;
  article?: string | null;
  styleName?: string | null;
  colors?: string | null;
  buyer?: string | null;
  brand?: string | null;
  sizeGroup?: string | null;
  typeField?: string | null;
  fob?: number | null;
  orderQty?: number | null;
  orderQtyWithoutExcess?: number | null;
  orderValue?: number | null;
  deliveryDate?: string | null;
  buyerPoDate?: string | null;
  buyerPoNo?: string | null;
  merchandiser?: string | null;
  orderVolume?: string | null;
  gst?: string | null;
  hsnCode?: string | null;
  sourceImportId?: string | null;
  remarks?: string | null;
  status?: string | null;
  createdAt?: string;
};

export default function MerchandisingPage() {
  const pathname = usePathname();
  const [selectedArea, setSelectedArea] = useState<WorkArea>("Orders");
  const [selectedStatus, setSelectedStatus] = useState<Status>("Draft");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });

  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean);
    const candidate = segments[0] === "workspace" ? (segments[2] ?? "") : (segments[0] ?? "");
    const organizationSegment = decodeURIComponent(candidate ?? "").trim();

    if (!organizationSegment || organizationSegment === "organization" || organizationSegment === "new" || organizationSegment === "settings") {
      setCurrentOrganizationId(null);
      return;
    }

    setCurrentOrganizationId(organizationSegment);
  }, [pathname]);

  const fetchOrders = useCallback(async (targetPage = page, targetStatus = selectedStatus, targetLimit = pageSize) => {
    if (!currentOrganizationId) {
      setOrders([]);
      setPagination({ page: targetPage, limit: targetLimit, total: 0, totalPages: 1, hasNext: false, hasPrevious: false });
      return;
    }

    setLoadingOrders(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(targetLimit),
        status: targetStatus,
        orgId: currentOrganizationId,
      });

      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      const nextRows = Array.isArray(payload?.data) ? payload.data : [];
      setOrders(nextRows);
      setPagination(
        payload?.meta ?? {
          page: targetPage,
          limit: targetLimit,
          total: nextRows.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        }
      );
    } catch {
      setOrders([]);
      setPagination({ page: targetPage, limit: targetLimit, total: 0, totalPages: 1, hasNext: false, hasPrevious: false });
    } finally {
      setLoadingOrders(false);
    }
  }, [currentOrganizationId, page, pageSize, selectedStatus]);

  useEffect(() => {
    if (selectedArea === "Orders" && !isCreatingOrder) {
      if (!currentOrganizationId) {
        setOrders([]);
        setPagination({ page, limit: pageSize, total: 0, totalPages: 1, hasNext: false, hasPrevious: false });
        return;
      }

      fetchOrders(page, selectedStatus, pageSize);
    }
  }, [selectedArea, isCreatingOrder, selectedStatus, page, pageSize, currentOrganizationId]);

  const filteredOrders = useMemo(() => orders, [orders]);

  const handleOrderSaved = async () => {
    setIsCreatingOrder(false);
    setPage(1);
    await fetchOrders(1, selectedStatus, pageSize);
  };

  if (isCreatingOrder) {
    return (
      <AppShell>
        <div className="page-frame">
          <OrderEntryForm
            defaultStatus={selectedStatus}
            onSaved={handleOrderSaved}
            onCancel={() => setIsCreatingOrder(false)}
            organizationId={currentOrganizationId}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-frame space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Merchandising work areas">
          {workAreas.map((area) => (
            <button
              key={area}
              type="button"
              role="tab"
              aria-selected={selectedArea === area}
              onClick={() => {
                setSelectedArea(area);
                setSelectedStatus("Draft");
              }}
              className={`rounded-xl px-4 py-4 text-left text-sm font-semibold shadow-sm transition ${selectedArea === area ? "bg-emerald-800 text-white shadow-emerald-900/15" : "border border-[#dce4dc] bg-white text-zinc-700 hover:border-emerald-700/40 hover:bg-[#f7faf7]"}`}
            >
              <span className="block text-[10px] uppercase tracking-[0.16em] opacity-65">0{workAreas.indexOf(area) + 1}</span>
              <span className="mt-2 block">{area}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={`${selectedArea} statuses`}>
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={selectedStatus === status}
                onClick={() => {
                  setSelectedStatus(status);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${selectedStatus === status ? "bg-[#17372a] text-white" : "border border-[#dce4dc] bg-white text-zinc-600 hover:border-emerald-700/40 hover:text-emerald-800"}`}
              >
                {status}
              </button>
            ))}
          </div>
          {selectedArea === "Orders" && (
            <button type="button" onClick={() => setIsCreatingOrder(true)} className="button-primary px-3 py-2 text-xs">Add order</button>
          )}
        </div>

        <section className="surface overflow-hidden" role="tabpanel" aria-label={selectedArea}>
          {selectedArea === "Orders" && (
            <>
              <TableHeader title="Orders" description={`Orders currently in ${selectedStatus.toLowerCase()}.`} action="Add order" actionHandler={() => setIsCreatingOrder(true)} />
              <DataTable orders={filteredOrders} loading={loadingOrders} status={selectedStatus} />
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-4 text-sm text-zinc-600 sm:px-6">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={!pagination.hasPrevious || loadingOrders}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span>
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                    disabled={!pagination.hasNext || loadingOrders}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
          {selectedArea === "Order Booking Summary" && <BookingSummary status={selectedStatus} />}
          {selectedArea === "Samples" && <><TableHeader title="Samples" description={`Samples currently in ${selectedStatus.toLowerCase()}.`} action="New sample" actionHandler={() => setIsCreatingOrder(true)} /><DataTable columns={["Sample ID", "Style", "Due date", "Status"]} status={selectedStatus} /></>}
          {selectedArea === "BOM" && <><TableHeader title="BOM" description={`Bills of material currently in ${selectedStatus.toLowerCase()}.`} action="New BOM" actionHandler={() => setIsCreatingOrder(true)} /><DataTable columns={["BOM number", "Style", "Version", "Updated", "Status"]} status={selectedStatus} /></>}
        </section>
      </div>
    </AppShell>
  );
}

function BookingSummary({ status }: { status: Status }) {
  const [dateBasis, setDateBasis] = useState<"Delivery Date" | "Work Order Date">("Delivery Date");
  const months = ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026"];

  return (
    <>
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <div><h2 className="text-lg font-semibold text-zinc-950">Order Booking Summary</h2><p className="mt-1 text-sm text-zinc-500">Monthly capacity and booking view for {status.toLowerCase()} orders.</p></div>
        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-500">Calendar by<select value={dateBasis} onChange={(event) => setDateBasis(event.target.value as typeof dateBasis)} className="field min-w-40 py-2 text-xs"><option>Delivery Date</option><option>Work Order Date</option></select></label>
      </div>
      <div className="grid gap-3 border-b border-zinc-100 p-5 sm:grid-cols-3 sm:p-6"><CapacityCard label="Total Capacity" value="—" note="Configure monthly capacity" tone="green" /><CapacityCard label="Booked Capacity" value="—" note="No booking data yet" tone="blue" /><CapacityCard label="Remaining Capacity" value="—" note="Calculated from bookings" tone="gold" /></div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[#f7faf7] text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"><tr>{["Calendar month", `Capacity by ${dateBasis}`, "Booked", "Remaining", "Utilization"].map((column) => <th key={column} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold sm:px-6">{column}</th>)}</tr></thead><tbody>{months.map((month) => <tr key={month} className="border-t border-zinc-100"><td className="whitespace-nowrap px-5 py-4 font-semibold text-zinc-800 sm:px-6">{month}</td><td className="px-5 py-4 text-zinc-500 sm:px-6">—</td><td className="px-5 py-4 text-zinc-500 sm:px-6">—</td><td className="px-5 py-4 text-zinc-500 sm:px-6">—</td><td className="px-5 py-4 text-zinc-500 sm:px-6">—</td></tr>)}</tbody></table></div>
    </>
  );
}

function CapacityCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: "green" | "blue" | "gold" }) {
  const dot = tone === "green" ? "bg-emerald-600" : tone === "blue" ? "bg-sky-600" : "bg-amber-500";
  return <div className="rounded-lg border border-zinc-200 p-4"><span className={`block size-2 rounded-full ${dot}`} /><p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p><p className="mt-1 text-xs text-zinc-500">{note}</p></div>;
}

function TableHeader({ title, description, action, actionHandler }: { title: string; description: string; action: string; actionHandler?: () => void }) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-zinc-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
      <div><h2 className="text-lg font-semibold text-zinc-950">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div>
      <button type="button" onClick={actionHandler} className="button-primary w-fit">{action}</button>
    </div>
  );
}

function DataTable({ columns, status, orders, loading }: { columns?: string[]; status?: Status; orders?: OrderRecord[]; loading?: boolean }) {
  type FilterOperator =
    | "contains"
    | "is"
    | "not_contains"
    | "empty"
    | "not_empty"
    | "gt"
    | "lt"
    | "gte"
    | "lte"
    | "equals"
    | "between"
    | "today"
    | "this_month"
    | "before"
    | "after";

  type FilterConfig = {
    operator: FilterOperator;
    value?: string;
    value2?: string;
  };

  const fullOrderColumns: Array<{ key: string; label: string; type: "text" | "number" | "date" }> = [
    { key: "orderNumber", label: "Order number", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "entityName", label: "Entity name", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "subCategory", label: "Sub category", type: "text" },
    { key: "season", label: "Season", type: "text" },
    { key: "article", label: "Article", type: "text" },
    { key: "styleName", label: "Style name", type: "text" },
    { key: "colors", label: "Colors", type: "text" },
    { key: "buyer", label: "Buyer", type: "text" },
    { key: "brand", label: "Brand", type: "text" },
    { key: "sizeGroup", label: "Size group", type: "text" },
    { key: "typeField", label: "Type", type: "text" },
    { key: "fob", label: "FOB", type: "number" },
    { key: "orderQty", label: "Order qty", type: "number" },
    { key: "orderQtyWithoutExcess", label: "Qty without excess", type: "number" },
    { key: "orderValue", label: "Order value", type: "number" },
    { key: "deliveryDate", label: "Delivery date", type: "date" },
    { key: "buyerPoDate", label: "Buyer PO date", type: "date" },
    { key: "buyerPoNo", label: "Buyer PO no", type: "text" },
    { key: "merchandiser", label: "Merchandiser", type: "text" },
    { key: "orderVolume", label: "Order volume", type: "text" },
    { key: "gst", label: "GST", type: "text" },
    { key: "hsnCode", label: "HSN code", type: "text" },
    { key: "sourceImportId", label: "Import reference", type: "text" },
    { key: "remarks", label: "Remarks", type: "text" },
    { key: "createdAt", label: "Created date", type: "date" },
  ];

  const parsedColumns = useMemo<Array<{ key: string; label: string; type: "text" | "number" | "date" }>>(() => {
    if (columns && columns.length > 0) {
      return columns.map((column) => {
        const inferredType: "text" | "number" | "date" =
          column.toLowerCase().includes("date") || column.toLowerCase().includes("time")
            ? "date"
            : column.toLowerCase().includes("qty") ||
                column.toLowerCase().includes("value") ||
                column.toLowerCase().includes("amount") ||
                column.toLowerCase().includes("count")
              ? "number"
              : "text";

        return {
          key: column.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          label: column,
          type: inferredType,
        };
      });
    }

    return fullOrderColumns;
  }, [columns]);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => Object.fromEntries(parsedColumns.map((column) => [column.key, true])));
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: "orderDate", direction: "desc" });
  const [filters, setFilters] = useState<Record<string, FilterConfig>>({});
  const [draftFilters, setDraftFilters] = useState<Record<string, FilterConfig>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [hasLoadedProfileSettings, setHasLoadedProfileSettings] = useState(false);
  const [loadedCount, setLoadedCount] = useState(10);

  useEffect(() => {
    setLoadedCount(10);
  }, [orders, status]);

  useEffect(() => {
    setVisibleColumns((previous) => {
      const next: Record<string, boolean> = {};
      parsedColumns.forEach((column) => {
        next[column.key] = previous[column.key] ?? true;
      });
      return next;
    });
  }, [parsedColumns]);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/user/profile")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        const saved = payload?.profileSettings?.reportPreferences ?? {};

        if (!isMounted) return;

        if (saved.visibleColumns) {
          setVisibleColumns((previous) => ({ ...previous, ...saved.visibleColumns }));
        }
        setHasLoadedProfileSettings(true);
      })
      .catch(() => {
        if (isMounted) {
          setHasLoadedProfileSettings(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedProfileSettings) return;

    const timeoutId = window.setTimeout(() => {
      fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportPreferences: {
            visibleColumns,
          },
        }),
      }).catch(() => undefined);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [hasLoadedProfileSettings, visibleColumns]);

  const visibleColumnList = parsedColumns.filter((column) => visibleColumns[column.key] !== false);

  const getColumnType = (key: string): "text" | "number" | "date" => {
    return parsedColumns.find((column) => column.key === key)?.type ?? "text";
  };

  const getCellValue = (order: OrderRecord, key: string) => {
    switch (key) {
      case "orderNumber":
        return order.id.slice(0, 8).toUpperCase();
      case "entityName":
        return order.entityName ?? "—";
      case "category":
        return order.category ?? "—";
      case "subCategory":
        return order.subCategory ?? "—";
      case "season":
        return order.season ?? "—";
      case "article":
        return order.article ?? "—";
      case "styleName":
        return order.styleName ?? "—";
      case "colors":
        return order.colors ?? "—";
      case "buyer":
        return order.buyer ?? "—";
      case "brand":
        return order.brand ?? "—";
      case "sizeGroup":
        return order.sizeGroup ?? "—";
      case "typeField":
        return order.typeField ?? "Direct";
      case "fob":
        return Number(order.fob ?? 0);
      case "orderQty":
        return Number(order.orderQty ?? 0);
      case "orderQtyWithoutExcess":
        return Number(order.orderQtyWithoutExcess ?? 0);
      case "orderValue":
        return Number(order.orderValue ?? 0);
      case "deliveryDate":
        return order.deliveryDate ?? "—";
      case "buyerPoDate":
        return order.buyerPoDate ?? "—";
      case "buyerPoNo":
        return order.buyerPoNo ?? "—";
      case "merchandiser":
        return order.merchandiser ?? "—";
      case "orderVolume":
        return order.orderVolume ?? "—";
      case "gst":
        return order.gst ?? "—";
      case "hsnCode":
        return order.hsnCode ?? "—";
      case "sourceImportId":
        return order.sourceImportId ?? "—";
      case "remarks":
        return order.remarks ?? "—";
      case "createdAt":
        return order.createdAt ? new Date(order.createdAt).toISOString() : "—";
      case "status":
      default:
        return order.status ?? "Draft";
    }
  };

  const getOperatorsForType = (type: "text" | "number" | "date") => {
    if (type === "number") {
      return ["gt", "lt", "gte", "lte", "between", "equals", "empty", "not_empty"] as const;
    }
    if (type === "date") {
      return ["today", "this_month", "before", "after", "between", "empty", "not_empty"] as const;
    }
    return ["contains", "is", "not_contains", "empty", "not_empty"] as const;
  };

  const getOperatorLabel = (operator: string) => {
    const map: Record<string, string> = {
      contains: "Contains",
      is: "Is",
      not_contains: "Not contains",
      empty: "Empty",
      not_empty: "Not empty",
      gt: "Greater than",
      lt: "Less than",
      gte: "Greater than or equal",
      lte: "Less than or equal",
      between: "Between",
      equals: "Equals",
      today: "Today",
      this_month: "This month",
      before: "Before",
      after: "After",
    };
    return map[operator] ?? operator;
  };

  const normalizedDate = (input: string | undefined) => {
    if (!input) return null;
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const matchesFilter = (order: OrderRecord, field: string, filter?: FilterConfig) => {
    if (!filter) return true;
    const cellValue = getCellValue(order, field);
    const type = getColumnType(field);

    const asText = String(cellValue ?? "").trim();

    if (type === "text") {
      if (filter.operator === "empty") return !asText || asText === "—";
      if (filter.operator === "not_empty") return Boolean(asText && asText !== "—");
      if (filter.operator === "contains") return asText.toLowerCase().includes((filter.value ?? "").trim().toLowerCase());
      if (filter.operator === "is") return asText.toLowerCase() === (filter.value ?? "").trim().toLowerCase();
      if (filter.operator === "not_contains") return !asText.toLowerCase().includes((filter.value ?? "").trim().toLowerCase());
      return true;
    }

    if (type === "number") {
      const numericValue = typeof cellValue === "number" ? cellValue : Number(cellValue ?? "");
      if (filter.operator === "empty") return Number.isNaN(numericValue);
      if (filter.operator === "not_empty") return !Number.isNaN(numericValue);
      if (filter.operator === "equals") return numericValue === Number(filter.value ?? 0);
      if (filter.operator === "gt") return numericValue > Number(filter.value ?? 0);
      if (filter.operator === "lt") return numericValue < Number(filter.value ?? 0);
      if (filter.operator === "gte") return numericValue >= Number(filter.value ?? 0);
      if (filter.operator === "lte") return numericValue <= Number(filter.value ?? 0);
      if (filter.operator === "between") {
        const low = Number(filter.value ?? 0);
        const high = Number(filter.value2 ?? low);
        return numericValue >= Math.min(low, high) && numericValue <= Math.max(low, high);
      }
      return true;
    }

    const dateValue = normalizedDate(typeof cellValue === "string" ? cellValue : undefined);
    const today = new Date();
    const isToday = (value: Date | null) => {
      if (!value) return false;
      return value.toDateString() === today.toDateString();
    };
    const isThisMonth = (value: Date | null) => {
      if (!value) return false;
      return value.getMonth() === today.getMonth() && value.getFullYear() === today.getFullYear();
    };

    if (filter.operator === "empty") return !dateValue;
    if (filter.operator === "not_empty") return !!dateValue;
    if (filter.operator === "today") return isToday(dateValue);
    if (filter.operator === "this_month") return isThisMonth(dateValue);
    if (filter.operator === "before") {
      const inputDate = normalizedDate(filter.value);
      return !!dateValue && !!inputDate && dateValue < inputDate;
    }
    if (filter.operator === "after") {
      const inputDate = normalizedDate(filter.value);
      return !!dateValue && !!inputDate && dateValue > inputDate;
    }
    if (filter.operator === "between") {
      const start = normalizedDate(filter.value);
      const end = normalizedDate(filter.value2);
      if (!dateValue || !start || !end) return false;
      return dateValue >= start && dateValue <= end;
    }
    return true;
  };

  const processedRows = useMemo(() => {
    if (!orders) return [];

    const nextRows = [...orders].filter((order) => {
      return Object.entries(filters).every(([field, filter]) => matchesFilter(order, field, filter));
    });

    if (!sortConfig) return nextRows;

    return nextRows.sort((a, b) => {
      const aValue = getCellValue(a, sortConfig.key);
      const bValue = getCellValue(b, sortConfig.key);

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
      }

      const left = String(aValue ?? "").toLowerCase();
      const right = String(bValue ?? "").toLowerCase();
      return sortConfig.direction === "asc"
        ? left.localeCompare(right)
        : right.localeCompare(left);
    });
  }, [orders, sortConfig, filters]);

  const visibleRows = useMemo(() => processedRows.slice(0, loadedCount), [processedRows, loadedCount]);

  const handleTableScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const threshold = 120;

    if (container.scrollHeight - container.scrollTop - container.clientHeight < threshold) {
      setLoadedCount((current) => Math.min(current + 10, processedRows.length));
    }
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns((previous) => ({
      ...previous,
      [key]: !(previous[key] ?? true),
    }));
  };

  const handleSort = (key: string) => {
    setSortConfig((previous) => {
      if (previous?.key === key) {
        return { key, direction: previous.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const activeFilterCount = Object.keys(filters).length;

  const clearAllFilters = () => {
    setFilters({});
    setDraftFilters({});
    setActiveFilter(null);
  };

  const openFilterForColumn = (columnKey: string) => {
    const current = filters[columnKey] ?? { operator: "contains", value: "", value2: "" };
    setDraftFilters((previous) => ({
      ...previous,
      [columnKey]: { ...current },
    }));
    setActiveFilter(columnKey);
  };

  const applyDraftFilter = (columnKey: string) => {
    const next = draftFilters[columnKey];
    if (!next) {
      setFilters((previous) => {
        const copy = { ...previous };
        delete copy[columnKey];
        return copy;
      });
      setActiveFilter(null);
      return;
    }

    setFilters((previous) => ({
      ...previous,
      [columnKey]: { ...next },
    }));
    setActiveFilter(null);
  };

  const clearFilterForColumn = (columnKey: string) => {
    setDraftFilters((previous) => {
      const copy = { ...previous };
      delete copy[columnKey];
      return copy;
    });
    setFilters((previous) => {
      const copy = { ...previous };
      delete copy[columnKey];
      return copy;
    });
    setActiveFilter(null);
  };

  const getFilterSummary = (columnKey: string) => {
    const filter = filters[columnKey];
    if (!filter) return null;

    const label = getOperatorLabel(filter.operator);
    const valueText = filter.value ? `: ${filter.value}${filter.value2 ? ` - ${filter.value2}` : ""}` : "";
    return `${label}${valueText}`;
  };

  if (orders) {
    if (loading) {
      return <div className="px-5 py-10 text-center text-sm text-zinc-500 sm:px-6">Loading orders...</div>;
    }

    if (orders.length === 0) {
      return <div className="px-5 py-10 text-center text-sm text-zinc-500 sm:px-6">No {status?.toLowerCase() ?? "draft"} records yet. Use the Add order button to create a new order.</div>;
    }

    return (
      <div className="overflow-hidden border border-[#e5e7eb] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ee] bg-[#f7faf7] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            <span>Report view</span>
            {activeFilterCount > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-800">{activeFilterCount} active</span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={clearAllFilters} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800">Clear filters</button>
            <div>
              <button
                type="button"
                onClick={() => setShowColumnModal(true)}
                className="grid size-7 place-items-center rounded-md border border-rose-200 bg-rose-50 text-sm text-rose-700 transition hover:bg-rose-100"
                title="Choose visible columns"
                aria-label="Choose visible columns"
              >
                👁
              </button>
            </div>
          </div>
        </div>

        {showColumnModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
            <div className="flex h-[82vh] w-full max-w-5xl flex-col rounded-[28px] border border-zinc-200 bg-white shadow-2xl shadow-slate-900/20">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Report settings</p>
                  <h3 className="mt-1 text-xl font-semibold text-zinc-900">Visible fields</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowColumnModal(false)}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {parsedColumns.map((column) => (
                    <label
                      key={column.key}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 text-sm transition ${visibleColumns[column.key] !== false ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}
                    >
                      <div>
                        <div className="font-semibold">{column.label}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-zinc-500">{column.type}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={visibleColumns[column.key] !== false}
                        onChange={() => toggleColumn(column.key)}
                        className="h-4 w-4 accent-emerald-700"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => {
                    parsedColumns.forEach((column) => {
                      setVisibleColumns((previous) => ({ ...previous, [column.key]: true }));
                    });
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setShowColumnModal(false)}
                  className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto" onScroll={handleTableScroll}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f7faf7] text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                {visibleColumnList.map((column) => (
                  <th key={column.key} scope="col" className="relative whitespace-nowrap border-b border-[#edf0ee] px-3 py-2 font-semibold sm:px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openFilterForColumn(column.key)}
                        className="flex items-center gap-1 text-left hover:text-emerald-800"
                      >
                        {column.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSort(column.key)}
                        className="grid size-4 place-items-center rounded text-[9px] text-zinc-500 hover:text-emerald-700"
                        aria-label={`Sort ${column.label}`}
                      >
                        {sortConfig?.key === column.key ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}
                      </button>
                    </div>

                    {filters[column.key] && (
                      <div className="mt-2 flex items-center justify-between gap-1 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-1 text-[9px] font-semibold text-rose-700">
                        <button
                          type="button"
                          onClick={() => openFilterForColumn(column.key)}
                          className="max-w-[130px] truncate text-left leading-none hover:text-rose-900"
                          title={getFilterSummary(column.key) ?? "Applied filter"}
                        >
                          {getFilterSummary(column.key)}
                        </button>
                        <button
                          type="button"
                          onClick={() => clearFilterForColumn(column.key)}
                          className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-rose-600 text-[8px] leading-none text-white hover:bg-rose-700"
                          aria-label={`Remove filter for ${column.label}`}
                          title={`Remove filter for ${column.label}`}
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {activeFilter === column.key && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]">
                        <div className="w-full max-w-[420px] rounded-2xl border border-[#dfe9df] bg-white p-4 shadow-2xl shadow-slate-900/20">
                          <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                            <span className="truncate">Filter: {column.label}</span>
                            {filters[column.key] && (
                              <button type="button" onClick={() => clearFilterForColumn(column.key)} className="shrink-0 text-rose-600 hover:text-rose-700">Clear</button>
                            )}
                          </div>

                          <div className="flex w-full flex-col gap-4">
                            <div className="block w-full text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                              <div className="mb-2">Condition</div>
                              <div className="w-full rounded-xl border border-[#dfe4df] bg-white p-1.5">
                                <div className="flex max-h-48 w-full flex-col gap-1 overflow-y-auto">
                                  {getOperatorsForType(getColumnType(column.key)).map((operator) => {
                                    const active = (draftFilters[column.key]?.operator ?? "contains") === operator;
                                    return (
                                      <button
                                        key={operator}
                                        type="button"
                                        onClick={() => {
                                          setDraftFilters((previous) => ({
                                            ...previous,
                                            [column.key]: {
                                              operator,
                                              value: previous[column.key]?.value ?? "",
                                              value2: previous[column.key]?.value2 ?? "",
                                            },
                                          }));
                                        }}
                                        className={`w-full rounded-lg px-2 py-2 text-left text-[11px] font-medium transition ${active ? "bg-emerald-700 text-white shadow-sm" : "text-zinc-700 hover:bg-zinc-50"}`}
                                      >
                                        {getOperatorLabel(operator)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {(!draftFilters[column.key] || !["empty", "not_empty", "today", "this_month"].includes(draftFilters[column.key].operator)) && (
                              <label className="block w-full text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                <span className="mb-1 block">{draftFilters[column.key]?.operator === "between" ? "From" : "Value"}</span>
                                <input
                                  type={getColumnType(column.key) === "number" ? "number" : getColumnType(column.key) === "date" ? "date" : "text"}
                                  value={draftFilters[column.key]?.value ?? ""}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setDraftFilters((previous) => ({
                                      ...previous,
                                      [column.key]: { ...(previous[column.key] ?? { operator: "contains" }), value: nextValue },
                                    }));
                                  }}
                                  className="mt-1 block w-full rounded-lg border border-[#dfe4df] bg-white px-2 py-1.5 text-[11px] text-zinc-700 outline-none focus:border-emerald-700"
                                />
                              </label>
                            )}

                            {draftFilters[column.key]?.operator === "between" && (
                              <label className="block w-full text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                                <span className="mb-1 block">To</span>
                                <input
                                  type={getColumnType(column.key) === "number" ? "number" : "date"}
                                  value={draftFilters[column.key]?.value2 ?? ""}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setDraftFilters((previous) => ({
                                      ...previous,
                                      [column.key]: { ...(previous[column.key] ?? { operator: "between" }), value2: nextValue },
                                    }));
                                  }}
                                  className="mt-1 block w-full rounded-lg border border-[#dfe4df] bg-white px-2 py-1.5 text-[11px] text-zinc-700 outline-none focus:border-emerald-700"
                                />
                              </label>
                            )}
                          </div>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => setActiveFilter(null)} className="rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800">
                              Cancel
                            </button>
                            <button type="button" onClick={() => applyDraftFilter(column.key)} className="rounded-full bg-emerald-700 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-emerald-800">
                              OK
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((order) => (
                <tr key={order.id} className="border-t border-zinc-100 transition hover:bg-[#f9fbf9]">
                  {visibleColumnList.map((column) => (
                    <td key={`${order.id}-${column.key}`} className="whitespace-nowrap px-5 py-4 text-zinc-600 sm:px-6">
                      {column.key === "status" ? (
                        <span className="rounded-full bg-[#edf7ef] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                          {String(getCellValue(order, column.key) ?? "Draft")}
                        </span>
                      ) : column.key === "value" ? (
                        <span className="font-semibold text-zinc-800">₹{Number(getCellValue(order, column.key) ?? 0).toLocaleString("en-IN")}</span>
                      ) : (
                        <span>{String(getCellValue(order, column.key) ?? "—")}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-[#f7faf7] text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500"><tr>{(columns ?? []).map((column) => <th key={column} scope="col" className="whitespace-nowrap px-5 py-3 font-semibold sm:px-6">{column}</th>)}</tr></thead><tbody><tr><td colSpan={(columns ?? []).length || 1} className="px-5 py-10 text-center text-sm text-zinc-500 sm:px-6">No {status?.toLowerCase() ?? "draft"} records yet. This table will populate when {(columns ?? ["record"])[0].toLowerCase()} data is created.</td></tr></tbody></table></div>
  );
}
