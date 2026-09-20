"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";

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

type DetailTab = "orders" | "sizes" | "bom";

export default function ArticleOrderSummaryDetailPage() {
  const { organizationId, article } = useParams<{ workspaceId: string; organizationId: string; article: string }>();
  const [summary, setSummary] = useState<ArticleSummary | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("orders");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadArticle() {
      try {
        const response = await fetch(`/api/orders/article-summary?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server returned an invalid response. Please check your API route.");
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load article summary.");
        const requestedArticle = decodeURIComponent(article);
        setSummary((data.summaries ?? []).find((item: ArticleSummary) => item.article === requestedArticle) ?? null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load article summary.");
      }
    }

    if (organizationId && article) loadArticle();
  }, [organizationId, article]);

  if (error) return <div className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!summary) return <div className="p-6 text-sm text-slate-500">Loading article details...</div>;

  const buyersList = Array.isArray(summary.buyers) ? summary.buyers : [summary.buyers].filter(Boolean);
  const orderNumbersList = Array.isArray(summary.orderNumbers) ? summary.orderNumbers : [];
  const sizesList = Array.isArray(summary.sizes) ? summary.sizes : [];
  const bomList = Array.isArray(summary.bomItems) ? summary.bomItems : [];
  const totalQty = typeof summary.totalOrderQty === "number" ? summary.totalOrderQty : 0;
  const orderCount = typeof summary.orderCount === "number" ? summary.orderCount : 0;

  return (
    <div className="space-y-5 p-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{summary.article}</h1>
        <p className="mt-1 text-sm text-slate-600">{orderCount} orders · {totalQty.toLocaleString()} total order quantity · {buyersList.join(", ") || "No buyer"}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric label="Orders" value={orderCount.toString()} />
        <SummaryMetric label="Total Order Qty" value={totalQty.toLocaleString()} />
        <SummaryMetric label="Materials" value={bomList.length.toString()} />
      </div>

      <section className="border border-slate-200 bg-white">
        <Tabs
          tabs={[{ value: "orders", label: "Orders", panelId: "article-summary-panel" }, { value: "sizes", label: "Size Totals", panelId: "article-summary-panel" }, { value: "bom", label: "Consolidated BOM", panelId: "article-summary-panel" }]}
          value={activeTab}
          onChange={(value) => setActiveTab(value as DetailTab)}
          ariaLabel="Article summary views"
        />
        <div id="article-summary-panel" className="overflow-x-auto p-4" role="tabpanel">
          {activeTab === "orders" && <OrdersTable article={summary.article} orderNumbers={orderNumbersList} />}
          {activeTab === "sizes" && <SizesTable rows={sizesList} />}
          {activeTab === "bom" && <BomTable rows={bomList} allOrderNumbers={orderNumbersList} />}
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></div>;
}

function OrdersTable({ article, orderNumbers }: { article: string; orderNumbers: string[] }) {
  return (
    <Table className="rounded-none border-0 shadow-none">
      <thead className="border-b text-xs uppercase text-slate-500">
        <tr>
          <th className="p-2">Order Number</th>
          <th className="p-2">Article</th>
        </tr>
      </thead>
      <tbody>
        {orderNumbers.map((orderNo, idx) => (
          <tr key={`order-${orderNo}-${idx}`} className="border-b border-slate-100">
            <td className="p-2 font-medium text-emerald-700">{orderNo}</td>
            <td className="p-2 text-slate-700">{article}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function SizesTable({ rows }: { rows: ArticleSummary["sizes"] }) {
  return (
    <Table className="rounded-none border-0 shadow-none">
      <thead className="border-b text-xs uppercase text-slate-500">
        <tr>
          <th className="p-2">Size</th>
          <th className="p-2 text-right">Total Qty</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const qty = typeof row.totalQty === "number" ? row.totalQty : 0;
          return (
            <tr key={`size-${row.size}-${idx}`} className="border-b border-slate-100">
              <td className="p-2 text-slate-700">{row.size}</td>
              <td className="p-2 text-right font-semibold text-slate-900">{qty.toLocaleString()}</td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={2} className="p-5 text-center text-slate-500">No finished-goods size rows have been saved.</td></tr>}
      </tbody>
    </Table>
  );
}

function BomTable({ rows, allOrderNumbers }: { rows: ArticleSummary["bomItems"]; allOrderNumbers: string[] }) {
  return (
    <Table className="rounded-none border-0 shadow-none">
      <thead className="border-b text-xs uppercase text-slate-500">
        <tr>
          <th className="p-2">Raw Material</th>
          <th className="p-2">Category / Sub-Category</th>
          <th className="p-2 text-center">Order Count</th>
          <th className="p-2 text-right">Total Required Qty</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item, idx) => {
          const affected = item.affectedOrderNumbers && Array.isArray(item.affectedOrderNumbers) && item.affectedOrderNumbers.length > 0 ? item.affectedOrderNumbers : allOrderNumbers;
          const requiredQty = typeof item.totalRequiredQty === "number" ? item.totalRequiredQty : 0;

          return (
            <tr key={`bom-${item.rawMaterialName}-${idx}`} className="border-b border-slate-100 align-top">
              <td className="p-2 font-medium text-slate-900">
                {item.rawMaterialName}
                {item.size ? <span className="block text-xs text-slate-500">Size: {item.size}</span> : null}
              </td>
              <td className="p-2 text-slate-700">
                {item.categoryType ? <span className="block text-xs text-slate-500">Type: {item.categoryType}</span> : null}
                {item.category || "-"}{item.subCategory ? ` / ${item.subCategory}` : ""}
              </td>
              <td className="p-2 text-center font-medium text-slate-800">
                {affected.length} / {allOrderNumbers.length}
              </td>
              <td className="p-2 text-right font-semibold text-slate-900">{requiredQty.toLocaleString()}</td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={4} className="p-5 text-center text-slate-500">No BOM rows have been saved.</td></tr>}
      </tbody>
    </Table>
  );
}