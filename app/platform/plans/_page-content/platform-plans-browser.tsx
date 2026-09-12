"use client";

import { useState } from "react";
import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";

interface BusinessType {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
}

interface Plan {
  id: string;
  plan_id: string;
  plan_name: string;
  description: string | null;
  price: number | null;
  billing_cycle: string | null;
  is_active: boolean;
  businessType: BusinessType | null;
}

interface PlatformPlansBrowserProps {
  plans: Plan[];
  subscriptionCounts: Record<string, number>;
  error?: string;
  deletePlanAction: (formData: FormData) => Promise<void>;
}

export default function PlatformPlansBrowser({
  plans,
  subscriptionCounts,
  error,
  deletePlanAction,
}: PlatformPlansBrowserProps) {
  const modules = Array.from(
    new Map(
      plans
        .filter((plan) => plan.businessType)
        .map((plan) => [plan.businessType!.id, plan.businessType!]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));
  const fallbackPlans = plans.filter((plan) => !plan.businessType);
  const [selectedModuleId, setSelectedModuleId] = useState(modules[0]?.id ?? "general");
  const selectedModule = modules.find((module) => module.id === selectedModuleId);
  const selectedPlans = selectedModuleId === "general"
    ? fallbackPlans
    : plans.filter((plan) => plan.businessType?.id === selectedModuleId);

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="erp-eyebrow">Platform</p>
            <h1 className="text-2xl font-bold text-slate-900">Plans by business module</h1>
            <p className="text-sm text-slate-600">Choose a business module first, then manage the plans available inside it.</p>
          </div>
          <Link href="/platform/plans/create"><Button>Create plan</Button></Link>
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="border-b border-slate-100 px-3 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Business modules</p>
              <p className="mt-1 text-xs text-slate-500">{modules.length} configured module{modules.length === 1 ? "" : "s"}</p>
            </div>
            <nav className="mt-3 space-y-1" aria-label="Business modules">
              {modules.map((module) => {
                const modulePlans = plans.filter((plan) => plan.businessType?.id === module.id);
                const active = selectedModuleId === module.id;
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setSelectedModuleId(module.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <span className="min-w-0 pr-3">
                      <span className="block truncate text-sm font-bold">{module.name}</span>
                      <span className={`mt-1 block text-[11px] ${active ? "text-slate-300" : "text-slate-500"}`}>{modulePlans.length} plan{modulePlans.length === 1 ? "" : "s"}</span>
                    </span>
                    <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${active ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>{modulePlans.length}</span>
                  </button>
                );
              })}
              {fallbackPlans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedModuleId("general")}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${selectedModuleId === "general" ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <span><span className="block text-sm font-bold">General</span><span className="mt-1 block text-[11px] opacity-70">Unassigned plans</span></span>
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 text-xs font-bold text-slate-600">{fallbackPlans.length}</span>
                </button>
              )}
            </nav>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">Selected module</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{selectedModule?.name ?? "General"}</h2>
                <p className="mt-1 text-xs text-slate-500">Manage tiers, pricing, restrictions, and active subscriptions for this module.</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available plans</p>
                <p className="text-2xl font-black text-slate-900">{selectedPlans.length}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Active subscriptions</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {selectedPlans.length > 0 ? selectedPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-4">
                        <p className="font-bold text-slate-900">{plan.plan_name.includes(" - ") ? plan.plan_name.split(" - ").slice(1).join(" - ") : plan.plan_name}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{plan.id}</p>
                      </td>
                      <td className="max-w-xs px-4 py-4 text-slate-600">{plan.description || "No description provided."}</td>
                      <td className="px-4 py-4 font-bold text-slate-900">{plan.price && Number(plan.price) > 0 ? `₹${Number(plan.price).toLocaleString("en-IN")}${plan.billing_cycle ? ` / ${plan.billing_cycle}` : ""}` : "Free"}</td>
                      <td className="px-4 py-4"><span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">{subscriptionCounts[plan.id] ?? 0}</span></td>
                      <td className="px-4 py-4"><Badge className={plan.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>{plan.is_active ? "Active" : "Inactive"}</Badge></td>
                      <td className="space-x-2 px-4 py-4 text-right">
                        <Link href={`/platform/plans/${plan.id}/restrictions`} className="inline-block rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-600 hover:bg-indigo-100">Restrictions</Link>
                        <form action={deletePlanAction} className="inline">
                          <input type="hidden" name="planId" value={plan.plan_id} />
                          <button type="submit" className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 font-semibold text-rose-600 hover:bg-rose-100">Delete</button>
                        </form>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">No plans have been created for this module yet.</td></tr>
                  )}
                </tbody>
              </Table>
            </div>
          </div>
        </div>
      </Section>
    </Page>
  );
}
