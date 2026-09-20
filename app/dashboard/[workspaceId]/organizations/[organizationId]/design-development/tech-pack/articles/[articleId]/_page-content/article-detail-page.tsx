"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ArticleRecord = {
  id: string;
  value_id: string;
  label: string;
  code: string | null;
  description: string | null;
  fields?: Record<string, unknown>;
};

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

type DetailTab = "overview" | "orders" | "materials";

export default function ArticleDetailPage() {
  const { organizationId, articleId } = useParams<{ workspaceId: string; organizationId: string; articleId: string }>();
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [summary, setSummary] = useState<ArticleSummary | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) return;

    let isMounted = true;

    async function loadArticle() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/article?includeInactive=true&limit=500`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load article details.");
        }

        const articleList = Array.isArray(payload) ? payload : (payload.values ?? payload.masterOptions?.article ?? []);
        const matched = articleList.find((item: ArticleRecord) => item.value_id === decodeURIComponent(articleId ?? "") || item.id === decodeURIComponent(articleId ?? "") || item.label === decodeURIComponent(articleId ?? ""));

        if (!isMounted) return;
        setArticle(matched ?? null);

        const summaryResponse = await fetch(`/api/orders/article-summary?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
        const summaryPayload = await summaryResponse.json();
        if (!summaryResponse.ok) throw new Error(summaryPayload.error || "Unable to load article summary.");
        const articleName = matched?.label || matched?.fields?.article || decodeURIComponent(articleId ?? "");
        const matchedSummary = (summaryPayload.summaries ?? []).find((item: ArticleSummary) => item.article === articleName) ?? null;

        if (!isMounted) return;
        setSummary(matchedSummary);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load article details.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadArticle();
    return () => {
      isMounted = false;
    };
  }, [organizationId, articleId]);

  const articleFields = useMemo(() => article?.fields ?? {}, [article]);

  const articleName = String(article?.label || articleFields.article || "Article");
  const articleCode = String(article?.code || articleFields.article_code || "—");
  const designBy = String(articleFields.design_by || "—");
  const designedDate = String(articleFields.designed_date || "—");
  const runningOrderQty = Number(articleFields.running_order_qty ?? summary?.totalOrderQty ?? 0);
  const runningOrderVariants = Number(articleFields.running_order_variants ?? summary?.orderCount ?? 0);

  if (loading) {
    return <main className="p-6 text-sm text-slate-500">Loading article details...</main>;
  }

  if (error) {
    return (
      <main className="p-6">
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="p-6">
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Article not found.</div>
      </main>
    );
  }

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders" },
    { id: "materials", label: "Materials" },
  ];

  const orderNumbers = Array.isArray(summary?.orderNumbers) ? summary.orderNumbers : [];
  const sizesRows = Array.isArray(summary?.sizes) ? summary.sizes : [];
  const bomRows = Array.isArray(summary?.bomItems) ? summary.bomItems : [];

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{articleName}</h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{articleCode}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-xs font-semibold text-slate-600">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 pb-2 transition ${
              activeTab === tab.id ? "border-emerald-600 text-emerald-700" : "border-transparent hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-5">
            <MetricCard label="Article Code" value={articleCode} />
            <MetricCard label="Design By" value={designBy} />
            <MetricCard label="Designed Date" value={designedDate} />
            <MetricCard label="Running Order Qty" value={runningOrderQty.toLocaleString()} />
            <MetricCard label="Running Variants" value={runningOrderVariants.toLocaleString()} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Current fields</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(articleFields).map(([key, value]) => {
                  if (["article", "article_code", "design_by", "designed_date", "running_order_qty", "running_order_variants"].includes(key)) {
                    return null;
                  }
                  const displayValue = Array.isArray(value) ? value.join(", ") : value === null || value === undefined || value === "" ? "—" : String(value);
                  return (
                    <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{key}</p>
                      <p className="mt-1 text-sm font-medium text-slate-700 break-words">{displayValue}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Order summary</h2>
              <div className="mt-4 space-y-3">
                <SummaryRow label="Orders" value={String(summary?.orderCount ?? 0)} />
                <SummaryRow label="Total Qty" value={String(summary?.totalOrderQty ?? 0)} />
                <SummaryRow label="Buyers" value={summary?.buyers?.length ? summary.buyers.join(", ") : "No buyer"} />
                <SummaryRow label="Order Numbers" value={orderNumbers.length ? orderNumbers.join(", ") : "No orders listed"} />
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "orders" && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Order Number</th>
                  <th className="p-3">Article</th>
                  <th className="p-3 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {orderNumbers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-slate-500">No orders are linked to this article yet.</td>
                  </tr>
                ) : (
                  orderNumbers.map((orderNo) => (
                    <tr key={orderNo} className="border-b border-slate-100 last:border-0">
                      <td className="p-3 font-medium text-emerald-700">{orderNo}</td>
                      <td className="p-3 text-slate-700">{articleName}</td>
                      <td className="p-3 text-right font-semibold text-slate-900">{summary?.totalOrderQty?.toLocaleString() ?? "0"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "materials" && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Raw Material</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Size</th>
                  <th className="p-3 text-right">Required Qty</th>
                </tr>
              </thead>
              <tbody>
                {bomRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">No material rows are linked to this article.</td>
                  </tr>
                ) : (
                  bomRows.map((row, idx) => (
                    <tr key={`${row.rawMaterialName}-${idx}`} className="border-b border-slate-100 last:border-0">
                      <td className="p-3 font-medium text-slate-900">{row.rawMaterialName}</td>
                      <td className="p-3 text-slate-700">{row.category || "-"}{row.subCategory ? ` / ${row.subCategory}` : ""}</td>
                      <td className="p-3 text-slate-700">{row.size || "-"}</td>
                      <td className="p-3 text-right font-semibold text-slate-900">{row.totalRequiredQty.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-700">{value}</span>
    </div>
  );
}
