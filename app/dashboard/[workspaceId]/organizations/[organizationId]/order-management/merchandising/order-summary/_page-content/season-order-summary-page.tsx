"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";

type ArticleSummary = {
  season: string | null;
  article: string | null;
  articleCount: number;
  orderCount: number;
  totalOrderQty: number;
  buyers: string[];
  styles: string[];
  statuses: string[];
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState("");
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreController.current?.abort();
    const timeout = window.setTimeout(() => {
      const query = new URLSearchParams({
        organizationId,
        workspaceId,
        view: selectedSeason ? "articles" : "seasons",
        limit: "50",
        search,
        status: statusFilter,
      });
      if (selectedSeason) query.set("selectedSeason", selectedSeason.value ?? "");

      setLoading(true);
      setError("");
      fetch(`/api/orders/article-summary?${query.toString()}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unable to load the order summary.");
          if (controller.signal.aborted) return;
          setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
          setNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : null);
        })
        .catch((loadError) => {
          if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load the order summary.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      loadMoreController.current?.abort();
    };
  }, [organizationId, search, selectedSeason, statusFilter, workspaceId]);

  const statusOptions = useMemo(() => {
    const statuses = ["Draft", "Waiting For Approval", "Approved", "Waiting For Production Schedule", "Work Order", "Shipped", "Closed"];
    return [
      { value: "all", label: "All statuses" },
      ...statuses.map((status) => ({ value: status, label: status })),
    ];
  }, []);

  const loadMore = async () => {
    if (nextOffset === null || loadingMore) return;
    loadMoreController.current?.abort();
    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({
        organizationId,
        workspaceId,
        view: selectedSeason ? "articles" : "seasons",
        limit: "50",
        offset: String(nextOffset),
        search,
        status: statusFilter,
      });
      if (selectedSeason) query.set("selectedSeason", selectedSeason.value ?? "");
      const response = await fetch(`/api/orders/article-summary?${query.toString()}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load more order summaries.");
      if (controller.signal.aborted) return;
      setSummaries((current) => [...current, ...(Array.isArray(data.summaries) ? data.summaries : [])]);
      setNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : null);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load more order summaries.");
      }
    } finally {
      if (loadMoreController.current === controller) {
        loadMoreController.current = null;
        setLoadingMore(false);
      }
    }
  };

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
            {summaries.map((season) => (
                <tr key={season.season ?? "unassigned-season"} className="hover:bg-slate-50">
                  <td className="p-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSeason({ value: season.season })}
                      className="min-h-0 px-0 py-0 text-left font-semibold text-emerald-800 hover:bg-transparent hover:underline"
                    >
                      {displayLabel(season.season, "Unassigned Season")}
                    </Button>
                  </td>
                  <td className="p-3 text-right tabular-nums">{season.articleCount.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{season.orderCount.toLocaleString()}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{formatQuantity(season.totalOrderQty)}</td>
                  <td className="p-3 text-slate-600">{season.statuses.join(", ") || "-"}</td>
                </tr>
              ))}
            {summaries.length === 0 && !loading && <EmptyRow colSpan={5} message="No season orders match these filters." />}
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
            {summaries.map((summary) => {
              const articleSegment = encodeURIComponent(summary.article ?? "__missing_article__");
              const query = new URLSearchParams({
                season: summary.season ?? "",
                article: summary.article ?? "",
              });
              const detailPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order-summary/${articleSegment}?${query.toString()}`;
              return (
                <tr key={JSON.stringify([summary.season, summary.article])} className="hover:bg-slate-50">
                  <td className="p-3">
                    <Link href={detailPath} className="font-semibold text-emerald-800 hover:underline">
                      {displayLabel(summary.article, "Unassigned Article")}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-700">{summary.buyers.join(", ") || "-"}</td>
                  <td className="p-3 text-slate-700">{summary.styles.join(", ") || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{summary.orderCount.toLocaleString()}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{formatQuantity(summary.totalOrderQty)}</td>
                  <td className="p-3 text-slate-600">{summary.statuses.join(", ") || "-"}</td>
                </tr>
              );
            })}
            {summaries.length === 0 && !loading && <EmptyRow colSpan={6} message="No article orders match these filters." />}
          </tbody>
        </Table>
      )}
      {loadingMore && <p role="status" className="text-center text-xs text-slate-500">Loading more summaries…</p>}
      {nextOffset !== null && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" size="sm" disabled={loading || loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </main>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <tr><td colSpan={colSpan} className="p-8 text-center text-sm text-slate-500">{message}</td></tr>;
}