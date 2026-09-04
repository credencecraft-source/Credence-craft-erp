import React from "react";
import { redirect } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { listOrganizationClients } from "@/lib/services/platform/client-service";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import { 
  createSubscription, 
  listSubscriptions, 
  updateSubscription, 
  deleteSubscription 
} from "@/lib/services/platform/subscription-service";

interface PageProps {
  searchParams?: Promise<{ error?: string; success?: string; modal?: string; edit?: string }>;
}

export default async function PlatformSubscriptionsPage({ searchParams }: PageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const isModalOpen = resolvedSearch.modal === "open";
  const editId = resolvedSearch.edit;
  
  const clients = await listOrganizationClients();
  const plans = await listPlans();
  const allBusinessTypes = await listBusinessTypes();
  const activeBusinessTypes = allBusinessTypes.filter((bt: any) => (bt.isActive ?? true) === true);
  const subscriptions = await listSubscriptions();

  const editingSubscription = editId ? subscriptions.find((s: any) => s.id === editId) : null;

  async function createSubscriptionAction(formData: FormData) {
    "use server";
    const organizationId = String(formData.get("organizationId") || "");
    const businessTypeId = String(formData.get("businessTypeId") || "");
    const planId = String(formData.get("planId") || "");
    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");

    try {
      await createSubscription({ organizationId, businessTypeId, planId, startDate, endDate });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create subscription.";
      redirect(`/platform/subscriptions?error=${encodeURIComponent(message)}`);
    }

    redirect(`/platform/subscriptions?success=${encodeURIComponent("Subscription created successfully.")}`);
  }

  async function updateSubscriptionAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const organizationId = String(formData.get("organizationId") || "");
    const businessTypeId = String(formData.get("businessTypeId") || "");
    const planId = String(formData.get("planId") || "");
    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");

    try {
      await updateSubscription(id, { organizationId, businessTypeId, planId, startDate, endDate });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update subscription.";
      redirect(`/platform/subscriptions?error=${encodeURIComponent(message)}`);
    }

    redirect(`/platform/subscriptions?success=${encodeURIComponent("Subscription updated successfully.")}`);
  }

  async function deleteSubscriptionAction(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");

    try {
      await deleteSubscription(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete subscription.";
      redirect(`/platform/subscriptions?error=${encodeURIComponent(message)}`);
    }

    redirect(`/platform/subscriptions?success=${encodeURIComponent("Subscription deleted successfully.")}`);
  }

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="erp-eyebrow">Platform Admin</p>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Management</h1>
            <p className="text-sm text-slate-600">Overview of all active client subscriptions.</p>
          </div>
          <a
            href="/platform/subscriptions?modal=open"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            + Add Subscription
          </a>
        </div>

        {resolvedSearch.error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">{resolvedSearch.error}</p>
        )}
        {resolvedSearch.success && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-700">{resolvedSearch.success}</p>
        )}

        {(isModalOpen || editId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <Card className="w-full max-w-md p-6 bg-white shadow-xl space-y-4 relative">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  {editId ? "Edit Subscription" : "Add New Subscription"}
                </h2>
                <a href="/platform/subscriptions" className="text-xs font-semibold text-slate-400 hover:text-slate-700">
                  ✕
                </a>
              </div>

              <form action={editId ? updateSubscriptionAction : createSubscriptionAction} className="space-y-4">
                {editId && <input type="hidden" name="id" value={editId} />}
                
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Organization</label>
                  <select 
                    name="organizationId" 
                    required 
                    defaultValue={editingSubscription?.organizationId || ""}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                  >
                    <option value="">Select organization...</option>
                    {clients.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.organization_name} {c.email ? `- ${c.email}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Business Type</label>
                  <select 
                    name="businessTypeId" 
                    required 
                    defaultValue={editingSubscription?.businessTypeId || ""}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                  >
                    <option value="">Select business type...</option>
                    {activeBusinessTypes.map((bt: any) => (
                      <option key={bt.id} value={bt.id}>{bt.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Plan</label>
                  <select 
                    name="planId" 
                    required 
                    defaultValue={editingSubscription?.planId || ""}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                  >
                    <option value="">Select plan...</option>
                    {plans.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.plan_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Input 
                    label="Start Date" 
                    name="startDate" 
                    type="date" 
                    required 
                    defaultValue={editingSubscription?.startDate || ""}
                  />
                </div>

                <div>
                  <Input 
                    label="Expire Date" 
                    name="endDate" 
                    type="date" 
                    required 
                    defaultValue={editingSubscription?.endDate || editingSubscription?.expireDate || ""}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <a
                    href="/platform/subscriptions"
                    className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50"
                  >
                    Cancel
                  </a>
                  <Button type="submit">Save</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3">Active Subscriptions Report</h2>
          <Table>
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Business Type</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Start Date</th>
                <th className="px-4 py-3">Expire Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {subscriptions.map((sub: any) => {
                const matchedClient = clients.find((c: any) => c.id === sub.organizationId);
                const orgName = sub.organization_name || matchedClient?.organization_name || sub.organizationId;
                const orgEmail = matchedClient?.email ? ` - ${matchedClient.email}` : "";
                const endDate = sub.endDate || sub.expireDate || "—";

                return (
                  <tr key={sub.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {orgName}{orgEmail}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{sub.business_type_name || sub.businessTypeId}</td>
                    <td className="px-4 py-3 text-slate-600">{sub.plan_name || sub.planId}</td>
                    <td className="px-4 py-3 text-slate-600">{sub.startDate}</td>
                    <td className="px-4 py-3 text-slate-600">{endDate}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <a 
                        href={`/platform/subscriptions?edit=${sub.id}`}
                        className="text-emerald-600 hover:underline font-semibold"
                      >
                        Edit
                      </a>
                      <form action={deleteSubscriptionAction} className="inline">
                        <input type="hidden" name="id" value={sub.id} />
                        <button type="submit" className="text-red-600 hover:underline font-semibold bg-transparent border-0 cursor-pointer p-0">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400 italic">
                    No subscriptions created yet. Click "+ Add Subscription" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </Section>
    </Page>
  );
}