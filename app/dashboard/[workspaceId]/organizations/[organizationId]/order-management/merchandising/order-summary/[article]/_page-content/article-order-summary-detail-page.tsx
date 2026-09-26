"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";

type FinishedGoodsRow = {
  id: string;
  buyerSize: string | null;
  size: string | null;
  beforeExcessQty: number | null;
  excess: number | null;
  excessQty: number | null;
  totalQty: number | null;
};

type ReviewOrder = {
  id: string;
  orderNo: string;
  entityName: string | null;
  category: string | null;
  subCategory: string | null;
  season: string | null;
  article: string | null;
  styleName: string | null;
  colors: string | null;
  buyer: string | null;
  brand: string | null;
  sizeGroup: string | null;
  orderQty: number | null;
  deliveryDate: string | null;
  finalStatus: string;
  processStatus: string | null;
  finishedGoods: FinishedGoodsRow[];
};

type BomItem = {
  rawMaterialName: string;
  categoryType: string | null;
  category: string | null;
  subCategory: string | null;
  size: string | null;
  totalRequiredQty: number;
  affectedOrderNumbers: string[];
};

type ArticleReview = {
  season: string | null;
  article: string | null;
  orderCount: number;
  totalOrderQty: number;
  buyers: string[];
  orders: ReviewOrder[];
  bomItems: BomItem[];
};

type ReviewTab = "general" | "finishedGoods" | "materials";
type MaterialsTab = "common" | "specific" | "all";

const EMPTY_ORDERS: ReviewOrder[] = [];
const formatQuantity = (value: number) => value.toLocaleString();
const displayLabel = (value: string | null, fallback: string) => value?.trim() || fallback;

export default function ArticleOrderSummaryDetailPage() {
  const { workspaceId, organizationId, article: articleSegment } = useParams<{
    workspaceId: string;
    organizationId: string;
    article: string;
  }>();
  const searchParams = useSearchParams();
  const seasonParam = searchParams.get("season");
  const articleParam = searchParams.get("article");
  const [summary, setSummary] = useState<ArticleReview | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTab>("general");
  const [activeMaterialsTab, setActiveMaterialsTab] = useState<MaterialsTab>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const requestedArticle = articleParam ?? (articleSegment === "__missing_article__" ? "" : articleSegment);
    const requestedSeason = seasonParam ?? "";

    async function loadArticle() {
      setLoading(true);
      setError("");
      setSummary(null);
      try {
        const query = new URLSearchParams({
          organizationId,
          workspaceId,
          season: requestedSeason,
          article: requestedArticle,
        });
        const response = await fetch(`/api/orders/article-summary?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load article review.");
        if (!data.summary) throw new Error("Article summary was not found.");
        setSummary(data.summary as ArticleReview);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load article review.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    if (organizationId && workspaceId) loadArticle();
    return () => controller.abort();
  }, [articleParam, articleSegment, organizationId, seasonParam, workspaceId]);

  const orders = summary?.orders ?? EMPTY_ORDERS;
  const sizeRows = useMemo(() => buildSizeRows(orders), [orders]);
  const totalOrderQty = orders.reduce((total, order) => total + Number(order.orderQty ?? 0), 0);
  const statusCount = new Set(orders.map((order) => order.finalStatus).filter(Boolean)).size;
  const summaryPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order-summary`;

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading article review...</div>;
  if (error) return <div className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!summary) return <div className="m-6 rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">Article summary was not found.</div>;

  return (
    <main className="space-y-5 p-5">
      <header className="border-b border-slate-200 pb-4">
        <Link href={summaryPath} className="text-sm font-medium text-emerald-800 hover:underline">Back to Order Summary</Link>
        <p className="mt-3 text-xs font-semibold uppercase text-slate-500">{displayLabel(summary.season, "Unassigned Season")}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{displayLabel(summary.article, "Unassigned Article")}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {orders.length.toLocaleString()} orders · {formatQuantity(totalOrderQty)} planned order qty · {summary.buyers.join(", ") || "No buyer"}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Orders" value={orders.length.toLocaleString()} />
        <SummaryMetric label="Planned Order Qty" value={formatQuantity(totalOrderQty)} />
        <SummaryMetric label="Order Statuses" value={statusCount.toLocaleString()} />
      </div>

      <section className="border border-slate-200 bg-white">
        <Tabs
          tabs={[
            { value: "general", label: "General", panelId: "article-review-panel" },
            { value: "finishedGoods", label: "Finished Goods Qty", panelId: "article-review-panel" },
            { value: "materials", label: "Materials", panelId: "article-review-panel" },
          ]}
          value={activeTab}
          onChange={(value) => setActiveTab(value as ReviewTab)}
          ariaLabel="Article review sections"
        />
        <div id="article-review-panel" className="p-3 sm:p-4" role="tabpanel">
          {activeTab === "general" && <GeneralTable orders={orders} workspaceId={workspaceId} organizationId={organizationId} />}
          {activeTab === "finishedGoods" && <FinishedGoodsMatrix orders={orders} rows={sizeRows} />}
          {activeTab === "materials" && (
            <div className="space-y-3">
              <Tabs
                tabs={[
                  { value: "common", label: "Common Materials", panelId: "article-materials-panel" },
                  { value: "specific", label: "Specific Materials", panelId: "article-materials-panel" },
                  { value: "all", label: "All Materials", panelId: "article-materials-panel" },
                ]}
                value={activeMaterialsTab}
                onChange={(value) => setActiveMaterialsTab(value as MaterialsTab)}
                ariaLabel="Material categories"
              />
              <div id="article-materials-panel" role="tabpanel">
                <MaterialsTable
                  items={(summary.bomItems ?? []).filter((item) => {
                    const affectedOrderCount = new Set(item.affectedOrderNumbers).size;
                    if (activeMaterialsTab === "common") return orders.length > 0 && affectedOrderCount === orders.length;
                    if (activeMaterialsTab === "specific") return affectedOrderCount > 0 && affectedOrderCount < orders.length;
                    return true;
                  })}
                  orderCount={orders.length}
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function GeneralTable({
  orders,
  workspaceId,
  organizationId,
}: {
  orders: ReviewOrder[];
  workspaceId: string;
  organizationId: string;
}) {
  return (
    <Table className="rounded-md shadow-none">
      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
        <tr>
          <th className="whitespace-nowrap p-3">Order No.</th>
          <th className="whitespace-nowrap p-3">Style</th>
          <th className="whitespace-nowrap p-3">Buyer</th>
          <th className="whitespace-nowrap p-3">Brand</th>
          <th className="whitespace-nowrap p-3">Colors</th>
          <th className="whitespace-nowrap p-3">Category</th>
          <th className="whitespace-nowrap p-3">Size Group</th>
          <th className="whitespace-nowrap p-3 text-right">Order Qty</th>
          <th className="whitespace-nowrap p-3">Delivery</th>
          <th className="whitespace-nowrap p-3">Process Status</th>
          <th className="whitespace-nowrap p-3">Order Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {orders.map((order) => (
          <tr key={order.id} className="hover:bg-slate-50">
            <td className="whitespace-nowrap p-3 font-semibold">
              <Link
                href={`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${encodeURIComponent(order.id)}`}
                className="text-emerald-800 hover:underline"
              >
                {order.orderNo}
              </Link>
            </td>
            <td className="whitespace-nowrap p-3">{order.styleName || "-"}</td>
            <td className="whitespace-nowrap p-3">{order.buyer || "-"}</td>
            <td className="whitespace-nowrap p-3">{order.brand || "-"}</td>
            <td className="whitespace-nowrap p-3">{order.colors || "-"}</td>
            <td className="whitespace-nowrap p-3">{[order.category, order.subCategory].filter(Boolean).join(" / ") || "-"}</td>
            <td className="whitespace-nowrap p-3">{order.sizeGroup || "-"}</td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatQuantity(Number(order.orderQty ?? 0))}</td>
            <td className="whitespace-nowrap p-3">{order.deliveryDate || "-"}</td>
            <td className="whitespace-nowrap p-3">{order.processStatus || "-"}</td>
            <td className="whitespace-nowrap p-3"><StatusLabel status={order.finalStatus} /></td>
          </tr>
        ))}
        {orders.length === 0 && <EmptyRow colSpan={11} message="No orders belong to this article." />}
      </tbody>
    </Table>
  );
}

type SizeMatrixColumn = { size: string; buyerSizes: string[] };

function buildSizeRows(orders: ReviewOrder[]): SizeMatrixColumn[] {
  const columns = new Map<string, Set<string>>();
  for (const order of orders) {
    for (const row of order.finishedGoods) {
      const size = row.size?.trim() || "Unassigned Size";
      const buyerSize = row.buyerSize?.trim();
      if (!columns.has(size)) columns.set(size, new Set());
      if (buyerSize) columns.get(size)?.add(buyerSize);
    }
  }
  return [...columns].map(([size, buyerSizes]) => ({ size, buyerSizes: [...buyerSizes].sort() }))
    .sort((left, right) => left.size.localeCompare(right.size));
}

function FinishedGoodsMatrix({ orders, rows }: { orders: ReviewOrder[]; rows: SizeMatrixColumn[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Saved planned order quantities, including planned excess. These are not production completion or warehouse stock.</p>
      <Table className="rounded-md shadow-none">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600">
          <tr>
            <th className="sticky left-0 z-10 min-w-36 bg-slate-50 p-3">Order No.</th>
            <th className="sticky left-36 z-10 min-w-36 bg-slate-50 p-3">Style</th>
            {rows.map((column) => (
              <th key={column.size} className="min-w-36 p-3 text-right">
                <span className="block">{column.size}</span>
                <span className="mt-1 block font-normal normal-case text-slate-500">Buyer size: {column.buyerSizes.join(", ") || "-"}</span>
              </th>
            ))}
            <th className="min-w-32 p-3 text-right">Order Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-slate-50">
              <th className="sticky left-0 z-10 bg-white p-3 text-left font-semibold text-emerald-800">{order.orderNo}</th>
              <td className="sticky left-36 z-10 bg-white p-3 text-slate-700">{order.styleName || "-"}</td>
              {rows.map((column) => (
                <td key={column.size} className="p-3 align-top text-right tabular-nums">
                  <QuantityCell order={order} size={column.size} />
                </td>
              ))}
              <td className="p-3 text-right font-semibold tabular-nums">
                {formatQuantity(order.finishedGoods.reduce((total, row) => total + Number(row.totalQty ?? 0), 0))}
              </td>
            </tr>
          ))}
          {orders.length === 0 && <EmptyRow colSpan={rows.length + 3} message="No orders belong to this article." />}
        </tbody>
        {rows.length === 0 && orders.length > 0 && (
          <tbody>
            <tr><td colSpan={3} className="p-8 text-center text-sm text-slate-500">No finished-goods size quantities have been saved for these orders.</td></tr>
          </tbody>
        )}
        {rows.length > 0 && (
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 text-sm font-semibold">
            <tr>
              <th colSpan={2} className="sticky left-0 z-10 bg-slate-50 p-3 text-left">Size Total</th>
              {rows.map((column) => (
                <td key={column.size} className="p-3 text-right tabular-nums">
                  {formatQuantity(orders.reduce((total, order) => total + order.finishedGoods
                    .filter((row) => (row.size?.trim() || "Unassigned Size") === column.size)
                    .reduce((sizeTotal, row) => sizeTotal + Number(row.totalQty ?? 0), 0), 0))}
                </td>
              ))}
              <td className="p-3 text-right tabular-nums">
                {formatQuantity(orders.reduce((total, order) => total + order.finishedGoods.reduce((sum, row) => sum + Number(row.totalQty ?? 0), 0), 0))}
              </td>
            </tr>
          </tfoot>
        )}
      </Table>
    </div>
  );
}

function QuantityCell({ order, size }: { order: ReviewOrder; size: string }) {
  const matchingRows = order.finishedGoods.filter((row) =>
    (row.size?.trim() || "Unassigned Size") === size,
  );
  if (matchingRows.length === 0) return <span className="text-slate-300">-</span>;

  const total = matchingRows.reduce((sum, row) => sum + Number(row.totalQty ?? 0), 0);
  const base = matchingRows.reduce((sum, row) => sum + Number(row.beforeExcessQty ?? 0), 0);
  const excessQty = matchingRows.reduce((sum, row) => sum + Number(row.excessQty ?? 0), 0);
  const percentages = [...new Set(matchingRows.map((row) => row.excess).filter((value): value is number => value !== null))];
  const percentageLabel = percentages.length === 0 ? "-" : percentages.map((value) => `${value}%`).join(" / ");

  return (
    <div>
      <p className="font-semibold text-slate-900">{formatQuantity(total)}</p>
      <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
        Base {formatQuantity(base)} + {formatQuantity(excessQty)} excess ({percentageLabel})
      </p>
    </div>
  );
}

function MaterialsTable({ items, orderCount }: { items: BomItem[]; orderCount: number }) {
  return (
    <Table className="rounded-md shadow-none">
      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
        <tr>
          <th className="p-3">Material</th>
          <th className="p-3">Category</th>
          <th className="p-3">Size</th>
          <th className="p-3 text-right">Orders Using Material</th>
          <th className="p-3 text-right">Total Required Qty</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {items.map((item, index) => (
          <tr key={`${item.rawMaterialName}-${item.category}-${item.subCategory}-${item.size}-${index}`}>
            <td className="p-3 font-medium text-slate-900">{item.rawMaterialName || "-"}</td>
            <td className="p-3 text-slate-700">
              {[item.categoryType, item.category, item.subCategory].filter(Boolean).join(" / ") || "-"}
            </td>
            <td className="p-3">{item.size || "-"}</td>
            <td className="p-3 text-right tabular-nums">{item.affectedOrderNumbers.length} / {orderCount}</td>
            <td className="p-3 text-right font-semibold tabular-nums">{formatQuantity(Number(item.totalRequiredQty ?? 0))}</td>
          </tr>
        ))}
        {items.length === 0 && <EmptyRow colSpan={5} message="No BOM rows have been saved for these orders." />}
      </tbody>
    </Table>
  );
}

function StatusLabel({ status }: { status: string }) {
  const normalized = status.toLocaleLowerCase();
  const colorClass = normalized.includes("approved") || normalized.includes("closed") || normalized.includes("shipped")
    ? "bg-emerald-50 text-emerald-800"
    : normalized.includes("waiting")
      ? "bg-amber-50 text-amber-800"
      : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex whitespace-nowrap px-2 py-1 text-xs font-medium ${colorClass}`}>{status || "Unknown"}</span>;
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <tr><td colSpan={colSpan} className="p-8 text-center text-sm text-slate-500">{message}</td></tr>;
}