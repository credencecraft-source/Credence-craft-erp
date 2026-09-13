// File: app/dashboard/[workspaceId]/organizations/[organizationId]/order-management/merchandising/order-summary/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ArticleSummary = {
  article: string;
  season?: string;
  orderCount: number;
  totalOrderQty: number;
  buyers: string[];
  orderNumbers: string[];
  sizes: Array<{ size: string; totalQty: number }>;
  bomItems: Array<{
    rawMaterialName: string;
    categoryType: string | null;
    category: string | null;
    subCategory: string | null;
    size: string | null;
    totalRequiredQty: number;
    affectedOrderNumbers?: string[];
  }>;
};

export default function SeasonArticleSummaryDashboardPage() {
  const { workspaceId, organizationId } = useParams<{ workspaceId: string; organizationId: string }>();
  const [summaries, setSummaries] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummaries() {
      try {
        const response = await fetch(`/api/orders/article-summary?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server returned an invalid response. Please check your API route.");
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load article summary.");

        const list = Array.isArray(data.summaries) ? data.summaries : [];
        setSummaries(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load article summary.");
      } finally {
        setLoading(false);
      }
    }

    if (organizationId) loadSummaries();
  }, [organizationId]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading dashboard...</div>;
  if (error) return <div className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  // 1. Group raw summaries by Season first
  const seasonMap = new Map<string, ArticleSummary[]>();
  summaries.forEach((item) => {
    const seasonKey = item.season && item.season.trim() !== "" ? item.season.trim() : "Unassigned Season";
    if (!seasonMap.has(seasonKey)) {
      seasonMap.set(seasonKey, []);
    }
    seasonMap.get(seasonKey)!.push(item);
  });

  const seasons = Array.from(seasonMap.keys()).sort();

  // VIEW 2: Inside a specific Season Folder (Grouped & Merged by Article Name)
  if (selectedSeason) {
    const rawArticles = seasonMap.get(selectedSeason) || [];

    // Merge articles sharing the exact same name inside this season
    const mergedMap = new Map<string, ArticleSummary>();
    rawArticles.forEach((item) => {
      const artName = item.article.trim();
      if (!mergedMap.has(artName)) {
        mergedMap.set(artName, {
          ...item,
          buyers: [...(item.buyers || [])],
          orderNumbers: [...(item.orderNumbers || [])],
          sizes: [...(item.sizes || [])],
          bomItems: [...(item.bomItems || [])],
        });
      } else {
        const existing = mergedMap.get(artName)!;
        existing.orderCount += Number(item.orderCount) || 0;
        existing.totalOrderQty += Number(item.totalOrderQty) || 0;

        // Merge arrays uniquely
        item.buyers?.forEach((b) => { if (!existing.buyers.includes(b)) existing.buyers.push(b); });
        item.orderNumbers?.forEach((o) => { if (!existing.orderNumbers.includes(o)) existing.orderNumbers.push(o); });
      }
    });

    const currentArticles = Array.from(mergedMap.values());

    return (
      <div className="space-y-6 p-6">
        <div className="border-b border-slate-200 pb-4">
          <button
            type="button"
            onClick={() => setSelectedSeason(null)}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            &larr; Back to Seasons
          </button>
          <div className="mt-3 flex items-center gap-3">
            <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <h1 className="text-2xl font-bold text-slate-900">{selectedSeason}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">{currentArticles.length} unique grouped article(s) inside this season folder.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {currentArticles.map((summary) => {
            const detailPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order-summary/${encodeURIComponent(summary.article)}`;
            const buyersList = Array.isArray(summary.buyers) ? summary.buyers : [summary.buyers].filter(Boolean);
            const totalQty = typeof summary.totalOrderQty === "number" ? summary.totalOrderQty : 0;
            const orderCount = typeof summary.orderCount === "number" ? summary.orderCount : 0;

            return (
              <Link
                key={summary.article}
                href={detailPath}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-600 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{selectedSeason}</span>
                    <span className="text-xs font-semibold text-emerald-700 group-hover:underline">View Details &rarr;</span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-slate-900 group-hover:text-emerald-700">{summary.article}</h3>
                  <p className="mt-1 text-xs text-slate-500">Buyer: {buyersList.join(", ") || "No buyer"}</p>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Orders</p>
                      <p className="font-semibold text-slate-800">{orderCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total Qty</p>
                      <p className="font-semibold text-slate-800">{totalQty.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {currentArticles.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
            No articles found inside this season folder.
          </div>
        )}
      </div>
    );
  }

  // VIEW 1: Main Season Folders Grid Landing Page
  return (
    <div className="space-y-6 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Season Folders</h1>
        <p className="mt-1 text-sm text-slate-600">Click a season folder to open and view its grouped articles.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {seasons.map((season) => {
          const rawArticles = seasonMap.get(season) || [];

          // Unique count of distinct article names for the folder badge
          const uniqueArticlesCount = new Set(rawArticles.map((i) => i.article.trim())).size;
          const totalQty = rawArticles.reduce((acc, curr) => acc + (Number(curr.totalOrderQty) || 0), 0);
          const totalOrders = rawArticles.reduce((acc, curr) => acc + (Number(curr.orderCount) || 0), 0);

          return (
            <button
              key={season}
              type="button"
              onClick={() => setSelectedSeason(season)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:border-emerald-600 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <svg className="h-10 w-10 text-emerald-600 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {uniqueArticlesCount} article{uniqueArticlesCount === 1 ? "" : "s"}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-bold text-slate-900 group-hover:text-emerald-700">{season}</h2>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Total Orders</p>
                    <p className="font-semibold text-slate-800">{totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Total Qty</p>
                    <p className="font-semibold text-slate-800">{totalQty.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {seasons.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          No season folders available.
        </div>
      )}
    </div>
  );
}