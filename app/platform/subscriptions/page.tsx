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
  deleteSubscription,
  updateSubscriptionStatus,
} from "@/lib/services/platform/subscription-service";
import { listSubscriptionsPage } from "@/lib/services/platform/subscription-service";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";

interface PageProps {
  searchParams?: Promise<{ error?: string; success?: string; modal?: string; edit?: string; cursor?: string }>;
}

function formatDateForInput(val: any): string {
  if (!val) return "";
  try {
    const str = typeof val === "string" ? val : new Date(val).toISOString();
    return str.split("T")[0];
  } catch {
    return "";
  }
}

export default async function PlatformSubscriptionsPage({ searchParams }: PageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const isModalOpen = resolvedSearch.modal === "open";
  const editId = resolvedSearch.edit;
  
  const clients = await listOrganizationClients();
  const plans = await listPlans();
  const businessTypes = await listBusinessTypes();
  const subscriptionPage = await listSubscriptionsPage({ cursor: resolvedSearch.cursor });
  const subscriptions = subscriptionPage.subscriptions;

  const editingSub = editId ? subscriptions.find((s: any) => String(s.id || s._id) === String(editId)) : null;

  async function saveSubscription(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const id = String(formData.get("id") || "");
    const organizationId = String(formData.get("organizationId") || "");
    const businessTypeId = String(formData.get("businessTypeId") || "");
    const planId = String(formData.get("planId") || "");
    const startDate = String(formData.get("startDate") || "");
    const endDate = String(formData.get("endDate") || "");
    const paymentStatus = String(formData.get("paymentStatus") || "pending");
    const serviceStatus = String(formData.get("serviceStatus") || "active");

    const client = clients.find((c: any) => String(c.id || c._id) === organizationId);
    const organizationName = (client as any)?.organizationName || (client as any)?.organization_name || (client as any)?.name || "Unnamed";

    try {
      const payload: any = {
        organizationId,
        organizationName,
        organization_name: organizationName, 
        businessTypeId,
        business_type_id: businessTypeId,
        planId,
        plan_id: planId,
        startDate,
        endDate,
        paymentStatus,
      };

      if (id) {
        await updateSubscription(id, payload);
      } else {
        await createSubscription(payload);
      }
    } catch (error: any) {
      redirect(`/platform/subscriptions?error=${encodeURIComponent(error.message || "Failed to save")}`);
    }

    redirect(`/platform/subscriptions?success=${encodeURIComponent("Saved successfully.")}`);
  }

  async function updateStatus(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const id = String(formData.get("id") || "");
    try {
      await updateSubscriptionStatus(id, "paid");
    } catch (error: any) {
      redirect(`/platform/subscriptions?error=${encodeURIComponent(error.message)}`);
    }
    redirect(`/platform/subscriptions?success=${encodeURIComponent("Status updated.")}`);
  }

  async function remove(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await deleteSubscription(String(formData.get("id")));
    } catch (error: any) {
      redirect(`/platform/subscriptions?error=${encodeURIComponent(error.message)}`);
    }
    redirect(`/platform/subscriptions?success=${encodeURIComponent("Deleted successfully.")}`);
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="erp-eyebrow">Platform Admin</p>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Management</h1>
          </div>
          <a href="/platform/subscriptions?modal=open" className="px-4 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white">
            + Add Subscription
          </a>
        </div>

        {resolvedSearch.error && <p className="p-3 bg-red-50 text-red-700 text-xs rounded-xl">{resolvedSearch.error}</p>}
        {resolvedSearch.success && <p className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl">{resolvedSearch.success}</p>}

        {(isModalOpen || editId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <Card className="w-full max-w-md p-6 bg-white space-y-4">
              <div className="flex justify-between border-b pb-3">
                <h2 className="text-sm font-bold">{editId ? "Edit Subscription" : "New Subscription"}</h2>
                <a href="/platform/subscriptions" className="text-xs text-slate-400">✕</a>
              </div>

              <form action={saveSubscription} className="space-y-3">
                {editId && <input type="hidden" name="id" value={editId} />}
                
                <div>
                  <label className="block text-xs font-semibold mb-1">Organization</label>
                  <select name="organizationId" required defaultValue={editingSub?.organizationId || editingSub?.organization_id || ""} className="w-full border p-2 text-xs rounded-lg">
                    <option value="">Select...</option>
                    {clients.map((c: any) => (
                      <option key={c.id || c._id} value={c.id || c._id}>{c.organizationName || c.organization_name || c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Business Type</label>
                  <select name="businessTypeId" required defaultValue={editingSub?.businessTypeId || editingSub?.business_type_id || ""} className="w-full border p-2 text-xs rounded-lg">
                    <option value="">Select...</option>
                    {businessTypes.map((bt: any) => (
                      <option key={bt.id || bt._id} value={bt.id || bt._id}>{bt.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Plan</label>
                  <select name="planId" required defaultValue={editingSub?.planId || editingSub?.plan_id || ""} className="w-full border p-2 text-xs rounded-lg">
                    <option value="">Select...</option>
                    {plans.map((p: any) => (
                      <option key={p.id || p._id} value={p.id || p._id}>{(p as any).name || (p as any).plan_name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Input 
                    label="Start Date" 
                    name="startDate" 
                    type="date" 
                    required 
                    defaultValue={formatDateForInput(editingSub?.start_date || (editingSub as any)?.startDate)} 
                  />
                  <Input 
                    label="Expire Date" 
                    name="endDate" 
                    type="date" 
                    required 
                    defaultValue={formatDateForInput(editingSub?.end_date || (editingSub as any)?.endDate || (editingSub as any)?.expireDate)} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Payment Status</label>
                    <select name="paymentStatus" defaultValue={(editingSub as any)?.payment_status || (editingSub as any)?.paymentStatus || "pending"} className="w-full border p-2 text-xs rounded-lg">
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Service Status</label>
                    <select name="serviceStatus" defaultValue={(editingSub as any)?.service_status || (editingSub as any)?.serviceStatus || "active"} className="w-full border p-2 text-xs rounded-lg">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <a href="/platform/subscriptions" className="px-3 py-2 border text-xs rounded-lg">Cancel</a>
                  <Button type="submit">Save</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        <Card className="p-6">
          <Table>
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3">Org ID</th>
                <th className="px-3 py-3">Org Name</th>
                <th className="px-3 py-3">Business Type</th>
                <th className="px-3 py-3">Plan Name</th>
                <th className="px-3 py-3">Plan ID</th>
                <th className="px-3 py-3">Duration</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-3 py-3">Service</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs">
              {subscriptions.map((sub: any) => {
                const subBtId = String(sub.businessTypeId || sub.business_type_id || "").trim();
                const subPlanId = String(sub.planId || sub.plan_id || "").trim();

                const bt = businessTypes.find((b: any) => String(b.id || b._id).trim() === subBtId);
                const plan = plans.find((p: any) => String(p.id || p._id).trim() === subPlanId);
                const subId = sub.id || sub._id;

                const startStr = formatDateForInput(sub.start_date || sub.startDate);
                const endStr = formatDateForInput(sub.end_date || sub.endDate || sub.expireDate);

                return (
                  <tr key={subId} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-mono text-[11px]">{sub.organizationId || sub.organization_id}</td>
                    <td className="px-3 py-3 font-bold text-slate-900">
                      {sub.organization_name || sub.organizationName || "—"}
                    </td>
                    <td className="px-3 py-3">{bt?.name || "—"}</td>
                    <td className="px-3 py-3">{(plan as any)?.name || (plan as any)?.plan_name || "—"}</td>
                    <td className="px-3 py-3 font-mono text-[11px]">{subPlanId || "—"}</td>
                    <td className="px-3 py-3">
                      {startStr || "—"} to {endStr || "—"}
                    </td>
                    <td className="px-3 py-3"><span className="uppercase font-bold">{sub.payment_status || sub.paymentStatus}</span></td>
                    <td className="px-3 py-3"><span className="uppercase font-bold">{sub.service_status || sub.serviceStatus || "active"}</span></td>
                    <td className="px-3 py-3 text-right space-x-2">
                      {(sub.payment_status || sub.paymentStatus) !== "paid" && (
                        <form action={updateStatus} className="inline">
                          <input type="hidden" name="id" value={subId} />
                          <button className="text-emerald-600 font-semibold">Activate</button>
                        </form>
                      )}
                      <a href={`/platform/subscriptions?edit=${subId}`} className="text-emerald-600 font-semibold">Edit</a>
                      <form action={remove} className="inline">
                        <input type="hidden" name="id" value={subId} />
                        <button className="text-red-600 font-semibold">Delete</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </Section>
      {subscriptionPage.nextCursor && (
        <a href={`/platform/subscriptions?cursor=${encodeURIComponent(subscriptionPage.nextCursor)}`} className="text-sm font-semibold text-emerald-700">
          Next page
        </a>
      )}
    </Page>
  );
}