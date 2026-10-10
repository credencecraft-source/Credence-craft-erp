"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";

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

type ArticleSummary = {
  season: string | null;
  article: string | null;
  orderCount: number;
  totalOrderQty: number;
  buyers: string[];
  orders: ReviewOrder[];
};

type SeasonSelection = { value: string | null } | null;

const displayLabel = (value: string | null, fallback: string) => value?.trim() || fallback;
const formatQuantity = (value: number) => value.toLocaleString();

export default function SeasonOrderSummaryPage() {
  const { workspaceId, organizationId } = useParams<{ workspaceId: string; organizationId: string }>();
  const [summaries, setSummaries] = useState<ArticleSummary[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<SeasonSelection>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummaries() {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ organizationId, workspaceId });
        const response = await fetch(`/api/orders/article-summary?${query.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load the order summary.");
        setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load the order summary.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    if (organizationId && workspaceId) loadSummaries();
    return () => controller.abort();
  }, [organizationId, workspaceId]);

  const statusOptions = useMemo(() => {
    const statuses = new Set(summaries.flatMap((summary) => summary.orders.map((order) => order.finalStatus).filter(Boolean)));
    return [
      { value: "all", label: "All statuses" },
      ...[...statuses].sort().map((status) => ({ value: status, label: status })),
    ];
  }, [summaries]);

  const visibleSummaries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return summaries.flatMap((summary) => {
      if (selectedSeason && summary.season !== selectedSeason.value) return [];
      const seasonMatches = displayLabel(summary.season, "Unassigned Season").toLocaleLowerCase().includes(query);
      const articleMatches = displayLabel(summary.article, "Unassigned Article").toLocaleLowerCase().includes(query);
      const matchingOrders = summary.orders.filter((order) => {
        if (statusFilter !== "all" && order.finalStatus !== statusFilter) return false;
        if (!query || seasonMatches || articleMatches) return true;
        return [
          order.orderNo,
          order.styleName,
          order.buyer,
          order.brand,
          order.colors,
          order.finalStatus,
          order.processStatus,
        ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
      });
      return matchingOrders.length > 0 ? [{ summary, orders: matchingOrders }] : [];
    });
  }, [search, selectedSeason, statusFilter, summaries]);

  const seasonRows = useMemo(() => {
    const seasons = new Map<string, { value: string | null; articles: Set<string>; orders: ReviewOrder[] }>();
    for (const { summary, orders } of visibleSummaries) {
      const key = summary.season ?? "";
      let season = seasons.get(key);
      if (!season) {
        season = { value: summary.season, articles: new Set(), orders: [] };
        seasons.set(key, season);
      }
      season.articles.add(summary.article ?? "");
      season.orders.push(...orders);
    }
    return [...seasons.values()].sort((left, right) =>
      displayLabel(left.value, "Unassigned Season").localeCompare(displayLabel(right.value, "Unassigned Season")),
    );
  }, [visibleSummaries]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading order summary...</div>;
  if (error) return <div className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <main className="space-y-5 p-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          {selectedSeason && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedSeason(null)}
              className="mb-2 min-h-0 px-0 py-0 text-sm font-medium text-emerald-700 hover:bg-transparent hover:text-emerald-900"
            >
              Back to seasons
            </Button>
          )}
          <h1 className="text-xl font-bold text-slate-900">
            {selectedSeason ? displayLabel(selectedSeason.value, "Unassigned Season") : "Order Summary"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {selectedSeason ? "Compare articles and orders in this season." : "Review order volume across seasons."}
          </p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[minmax(220px,300px)_190px]">
          <Input
            aria-label="Search orders and articles"
            placeholder="Search season, article, order, buyer..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label="Filter by order status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={statusOptions}
          />
        </div>
      </header>

      {!selectedSeason ? (
        <Table className="rounded-md shadow-none">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="whitespace-nowrap p-3">Season</th>
              <th className="whitespace-nowrap p-3 text-right">Articles</th>
              <th className="whitespace-nowrap p-3 text-right">Orders</th>
              <th className="whitespace-nowrap p-3 text-right">Planned Order Qty</th>
              <th className="p-3">Order Statuses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {seasonRows.map((season) => {
              const statuses = [...new Set(season.orders.map((order) => order.finalStatus).filter(Boolean))].sort();
              const quantity = season.orders.reduce((total, order) => total + Number(order.orderQty ?? 0), 0);
              return (
                <tr key={season.value ?? "unassigned-season"} className="hover:bg-slate-50">
                  <td className="p-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSeason({ value: season.value })}
                      className="min-h-0 px-0 py-0 text-left font-semibold text-emerald-800 hover:bg-transparent hover:underline"
                    >
                      {displayLabel(season.value, "Unassigned Season")}
                    </Button>
                  </td>
                  <td className="p-3 text-right tabular-nums">{season.articles.size.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{season.orders.length.toLocaleString()}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{formatQuantity(quantity)}</td>
                  <td className="p-3 text-slate-600">{statuses.join(", ") || "-"}</td>
                </tr>
              );
            })}
            {seasonRows.length === 0 && <EmptyRow colSpan={5} message="No season orders match these filters." />}
          </tbody>
        </Table>
      ) : (
        <Table className="rounded-md shadow-none">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="whitespace-nowrap p-3">Article</th>
              <th className="p-3">Buyers</th>
              <th className="p-3">Styles</th>
              <th className="whitespace-nowrap p-3 text-right">Orders</th>
              <th className="whitespace-nowrap p-3 text-right">Planned Order Qty</th>
              <th className="p-3">Order Statuses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleSummaries.map(({ summary, orders }) => {
              const articleSegment = encodeURIComponent(summary.article ?? "__missing_article__");
              const query = new URLSearchParams({
                season: summary.season ?? "",
                article: summary.article ?? "",
              });
              const detailPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order-summary/${articleSegment}?${query.toString()}`;
              const buyers = [...new Set(orders.map((order) => order.buyer?.trim()).filter(Boolean))];
              const styles = [...new Set(orders.map((order) => order.styleName?.trim()).filter(Boolean))];
              const quantity = orders.reduce((total, order) => total + Number(order.orderQty ?? 0), 0);
              const statuses = [...new Set(orders.map((order) => order.finalStatus).filter(Boolean))].sort();
              return (
                <tr key={JSON.stringify([summary.season, summary.article])} className="hover:bg-slate-50">
                  <td className="p-3">
                    <Link href={detailPath} className="font-semibold text-emerald-800 hover:underline">
                      {displayLabel(summary.article, "Unassigned Article")}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-700">{buyers.join(", ") || "-"}</td>
                  <td className="p-3 text-slate-700">{styles.join(", ") || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{orders.length.toLocaleString()}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{formatQuantity(quantity)}</td>
                  <td className="p-3 text-slate-600">{statuses.join(", ") || "-"}</td>
                </tr>
              );
            })}
            {visibleSummaries.length === 0 && <EmptyRow colSpan={6} message="No article orders match these filters." />}
          </tbody>
        </Table>
      )}
    </main>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <tr><td colSpan={colSpan} className="p-8 text-center text-sm text-slate-500">{message}</td></tr>;
}