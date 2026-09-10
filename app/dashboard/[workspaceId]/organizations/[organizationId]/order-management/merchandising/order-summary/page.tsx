"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ArticleSummary = {
  article: string;
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

export default function OrderSummaryPage() {
  const { workspaceId, organizationId } = useParams<{ workspaceId: string; organizationId: string }>();
  const [summaries, setSummaries] = useState<ArticleSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSummaries() {
      try {
        setLoading(true);
        const response = await fetch(`/api/orders/article-summary?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server returned an invalid response. Please check your API route.");
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load article summaries.");
        setSummaries(data.summaries ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load article summaries.");
      } finally {
        setLoading(false);
      }
    }

    if (organizationId) {
      loadSummaries();
    }
  }, [organizationId]);

  const filteredSummaries = summaries.filter((summary) => {
    const buyers = Array.isArray(summary.buyers) ? summary.buyers : [];
    const orderNumbers = Array.isArray(summary.orderNumbers) ? summary.orderNumbers : [];
    const searchValues = [summary.article, ...buyers, ...orderNumbers];
    
    return searchValues.some((value) =>
      value && typeof value === "string" && value.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const detailBasePath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order-summary`;

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading summaries...</div>;
  if (error) return <div className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Article Order Summary</h1>
          <p className="mt-1 text-sm text-slate-600">Consolidated view of orders, quantities, and requirements by article.</p>
        </div>
        <input
          type="text"
          placeholder="Search article, buyer, order..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-72 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Article</th>
              <th className="p-3 text-center">Orders</th>
              <th className="p-3 text-right">Total Qty</th>
              <th className="p-3">Buyers</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSummaries.map((summary, index) => {
              const buyersList = Array.isArray(summary.buyers) ? summary.buyers : [];
              const totalQty = typeof summary.totalOrderQty === "number" ? summary.totalOrderQty : 0;
              const orderCount = typeof summary.orderCount === "number" ? summary.orderCount : 0;

              return (
                <tr key={`${summary.article}-${index}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-medium text-slate-900">{summary.article}</td>
                  <td className="p-3 text-center text-slate-700">{orderCount}</td>
                  <td className="p-3 text-right font-semibold text-slate-900">{totalQty.toLocaleString()}</td>
                  <td className="p-3 text-slate-600">{buyersList.join(", ") || "-"}</td>
                  <td className="p-3 text-right">
                    <Link
                      href={`${detailBasePath}/${encodeURIComponent(summary.article)}`}
                      className="font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      View Details →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filteredSummaries.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No summaries found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}