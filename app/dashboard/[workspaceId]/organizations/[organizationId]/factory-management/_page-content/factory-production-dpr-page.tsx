"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");
type ProcessCard = { processName: string; dates: Array<{ grnCount: number; receivedQty: number; actualMade: number }> };
type Dpr = { status: string; total_produced: number; total_transferred: number; total_received: number; total_labor_cost: number | string };
type DprAction = "GENERATE" | "SUBMIT" | "APPROVE" | "REJECT";

export default function FactoryProductionDprPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [processCards, setProcessCards] = useState<ProcessCard[]>([]);
  const [report, setReport] = useState<Dpr | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const loading = loadedRequestKey !== `${organizationId}:${date}`;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    let active = true;
    const requestKey = `${organizationId}:${date}`;
    const query = new URLSearchParams({ organizationId, date });
    void fetch(`/api/factory/production/dpr?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load production reports.");
        if (active) {
          setError("");
          setProcessCards(data.activity?.processCards ?? []);
          setReport(data.report ?? null);
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load production reports.");
      })
      .finally(() => {
        if (active) setLoadedRequestKey(requestKey);
      });
    return () => { active = false; };
  }, [organizationId, date]);

  async function runAction(action: DprAction) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/factory/production/dpr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, date, action, rejectionReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update the daily production report.");
      setReport(data.report ?? null);
      setMessage({
        GENERATE: "Daily production report generated.",
        SUBMIT: "Daily production report submitted for approval.",
        APPROVE: "Daily production report approved.",
        REJECT: "Daily production report rejected.",
      }[action]);
      setRejectionReason("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update the daily production report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Production</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Daily Production Report</h1>
            <p className="mt-2 text-sm text-slate-600">Generate a draft from factory GRNs, then submit it for independent approval.</p>
          </div>
          <div className="w-52">
            <Input label="Report date" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={loading || saving} />
          </div>
        </div>

        {error && <Card role="alert" className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
        {message && <Card role="status" className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</Card>}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{date} DPR</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${report?.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : report?.status === "SUBMITTED" ? "bg-sky-100 text-sky-800" : report?.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                  {report?.status ?? "NOT GENERATED"}
                </span>
              </div>
              {report && <p className="mt-2 text-sm text-slate-600">Produced {quantity(report.total_produced)} · Transferred {quantity(report.total_transferred)} · Received {quantity(report.total_received)} · Labor {Number(report.total_labor_cost).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void runAction("GENERATE")} disabled={loading || saving || (report !== null && report.status !== "DRAFT")}>
                {saving ? "Saving..." : report ? "Refresh draft" : "Generate draft"}
              </Button>
              {report?.status === "DRAFT" && <Button type="button" onClick={() => void runAction("SUBMIT")} disabled={loading || saving}>Submit for approval</Button>}
              {report?.status === "SUBMITTED" && (
                <>
                  <Button type="button" onClick={() => void runAction("APPROVE")} disabled={loading || saving}>Approve</Button>
                  <div className="w-64">
                    <Input label="Rejection reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} />
                  </div>
                  <Button type="button" onClick={() => void runAction("REJECT")} disabled={loading || saving || !rejectionReason.trim()}>Reject</Button>
                </>
              )}
            </div>
          </div>
          {report?.status === "SUBMITTED" && <p className="mt-3 text-xs text-slate-500">The submitter cannot approve their own report. Approval is limited to an owner or administrator.</p>}
          {report?.status === "REJECTED" && <p className="mt-3 text-xs text-amber-700">This report is locked after rejection. Correct source GRN activity through an authorized adjustment before creating a revised reporting flow.</p>}
        </Card>

        <div>
          <h2 className="mb-3 text-lg font-bold text-slate-900">Production by process</h2>
          {loading ? (
            <Card className="p-6 text-sm text-slate-600">Loading process summaries...</Card>
          ) : processCards.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">No process production activity is available yet.</Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {processCards.map((process) => {
                const summary = process.dates.reduce((total, item) => ({
                  grnCount: total.grnCount + item.grnCount,
                  receivedQty: total.receivedQty + item.receivedQty,
                  actualMade: total.actualMade + item.actualMade,
                }), { grnCount: 0, receivedQty: 0, actualMade: 0 });
                return (
                  <Link key={process.processName} href={`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor/dpr/${encodeURIComponent(process.processName)}`} className="group block">
                    <Card className="border-slate-200 p-5 transition hover:border-emerald-400 hover:shadow-md">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xl font-bold text-slate-900">{process.processName}</h3>
                        <span className="text-xs font-semibold text-emerald-700">Open -&gt;</span>
                      </div>
                      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                        <div><p className="text-[10px] uppercase text-slate-500">GRNs</p><p className="mt-1 font-bold text-slate-900">{summary.grnCount}</p></div>
                        <div><p className="text-[10px] uppercase text-slate-500">Made</p><p className="mt-1 font-bold text-emerald-700">{quantity(summary.actualMade)}</p></div>
                        <div><p className="text-[10px] uppercase text-slate-500">Received</p><p className="mt-1 font-bold text-sky-700">{quantity(summary.receivedQty)}</p></div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </Section>
    </Page>
  );
}
