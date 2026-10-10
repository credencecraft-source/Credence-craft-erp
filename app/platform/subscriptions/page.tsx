import { redirect } from "next/navigation";
import FormSubmitButton from "@/components/ui/FormSubmitButton";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Select from "@/components/ui/Select";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { listOrganizationClients } from "@/lib/services/platform/client-service";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import { 
  createSubscription, 
  updateSubscription, 
  deleteSubscription,
  approveSubscription,
} from "@/lib/services/platform/subscription-service";
import { listSubscriptionsPage } from "@/lib/services/platform/subscription-service";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";

type ClientRecord = Awaited<ReturnType<typeof listOrganizationClients>>[number] & {
  _id?: string;
  organizationName?: string | null;
  name?: string | null;
};

type BusinessTypeRecord = Awaited<ReturnType<typeof listBusinessTypes>>[number] & {
  _id?: string;
};

type PlanRecord = Awaited<ReturnType<typeof listPlans>>[number] & {
  _id?: string;
  name?: string | null;
};

type SubscriptionRecord = Awaited<ReturnType<typeof listSubscriptionsPage>>["subscriptions"][number] & {
  _id?: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  expireDate?: Date | string | null;
  billingMonths?: number | null;
  totalAmount?: number | string | null;
  serviceStatus?: string | null;
};

interface PageProps {
  searchParams?: Promise<{ error?: string; success?: string; modal?: string; edit?: string; cursor?: string }>;
}

function formatDateForInput(val: Date | string | null | undefined): string {
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
  const plans = (await listPlans()).filter((plan) => Number(plan.price ?? 0) > 0);
  const businessTypes = await listBusinessTypes();
  const subscriptionPage = await listSubscriptionsPage({ cursor: resolvedSearch.cursor });
  const subscriptions = subscriptionPage.subscriptions;

  const editingSub = editId
    ? subscriptions.find((subscription) => String(subscription.id || (subscription as SubscriptionRecord)._id) === String(editId))
    : null;

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
    const billingMonthsValue = String(formData.get("billingMonths") || "");

    const client = clients.find((record) => {
      const candidate = record as ClientRecord;
      return String(candidate.id || candidate._id) === organizationId;
    }) as ClientRecord | undefined;
    const organizationName = client?.organizationName || client?.organization_name || client?.name || "Unnamed";

    try {
      const payload: Parameters<typeof createSubscription>[0] = {
        organizationId,
        organizationName,
        businessTypeId,
        planId,
        startDate,
        endDate,
        paymentStatus,
        serviceStatus,
        billingMonths: billingMonthsValue ? Number(billingMonthsValue) : undefined,
      };

      if (id) {
        await updateSubscription(id, payload);
      } else {
        await createSubscription(payload);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save";
      redirect(`/platform/subscriptions?error=${encodeURIComponent(message || "Failed to save")}`);
    }

    redirect(`/platform/subscriptions?success=${encodeURIComponent("Saved successfully.")}`);
  }

  async function updateStatus(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const id = String(formData.get("id") || "");
    try {
      await approveSubscription(id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to update subscription status.";
      redirect(`/platform/subscriptions?error=${encodeURIComponent(message)}`);
    }
    redirect(`/platform/subscriptions?success=${encodeURIComponent("Status updated.")}`);
  }

  async function remove(formData: FormData) {
    "use server";
    const admin = await requirePlatformSessionAdmin();
    let wasDeleted = false;
    try {
      const result = await deleteSubscription(String(formData.get("id")), admin.id);
      wasDeleted = result.deleted;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to delete subscription.";
      redirect(`/platform/subscriptions?error=${encodeURIComponent(message)}`);
    }
    redirect(`/platform/subscriptions?success=${encodeURIComponent(wasDeleted ? "Deleted successfully." : "Subscription was already deleted.")}`);
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
                
                <Select
                  label="Organization"
                  name="organizationId"
                  required
                  defaultValue={editingSub?.organizationId || editingSub?.organization_id || ""}
                  className="rounded-lg px-2 py-2 text-xs"
                >
                    <option value="">Select...</option>
                    {clients.map((record) => {
                      const client = record as ClientRecord;
                      const id = client.id || client._id;
                      return (
                        <option key={id} value={id}>{client.organizationName || client.organization_name || client.name}</option>
                      );
                    })}
                </Select>

                <Select
                  label="Business Type"
                  name="businessTypeId"
                  required
                  defaultValue={editingSub?.businessTypeId || editingSub?.business_type_id || ""}
                  className="rounded-lg px-2 py-2 text-xs"
                >
                    <option value="">Select...</option>
                    {businessTypes.map((businessType) => {
                      const record = businessType as BusinessTypeRecord;
                      const id = record.id || record._id;
                      return (
                        <option key={id} value={id}>{record.name}</option>
                      );
                    })}
                </Select>

                <Select
                  label="Plan"
                  name="planId"
                  required
                  defaultValue={editingSub?.planId || editingSub?.plan_id || ""}
                  className="rounded-lg px-2 py-2 text-xs"
                >
                    <option value="">Select...</option>
                    {plans.map((plan) => {
                      const record = plan as PlanRecord;
                      const id = record.id || record._id;
                      return (
                        <option key={id} value={id}>{record.name || record.plan_name}</option>
                      );
                    })}
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <Input 
                    label="Start Date" 
                    name="startDate" 
                    type="date" 
                    required 
                    defaultValue={formatDateForInput(editingSub?.start_date || (editingSub as SubscriptionRecord | null)?.startDate)}
                  />
                  <Input 
                    label="Expire Date" 
                    name="endDate" 
                    type="date" 
                    required 
                    defaultValue={formatDateForInput(editingSub?.end_date || (editingSub as SubscriptionRecord | null)?.endDate || (editingSub as SubscriptionRecord | null)?.expireDate)}
                  />
                </div>

                <Select
                  label="Billing Term"
                  name="billingMonths"
                  defaultValue={(editingSub as SubscriptionRecord | null)?.billingMonths || "12"}
                  className="rounded-lg px-2 py-2 text-xs"
                >
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <Select
                    label="Payment Status"
                    name="paymentStatus"
                    defaultValue={editingSub?.payment_status || editingSub?.paymentStatus || "pending"}
                    className="rounded-lg px-2 py-2 text-xs"
                  >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                  </Select>
                  <Select
                    label="Service Status"
                    name="serviceStatus"
                    defaultValue={editingSub?.service_status || (editingSub as SubscriptionRecord | null)?.serviceStatus || "active"}
                    className="rounded-lg px-2 py-2 text-xs"
                  >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                  </Select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <a href="/platform/subscriptions" className="px-3 py-2 border text-xs rounded-lg">Cancel</a>
                  <FormSubmitButton pendingLabel="Saving...">Save</FormSubmitButton>
                </div>
              </form>
            </Card>
          </div>
        )}

        <Card className="p-6">
          <Table>
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3">Organization Name</th>
                <th className="px-3 py-3">Organization ID</th>
                <th className="px-3 py-3">Organization Number</th>
                <th className="px-3 py-3">Plan Name</th>
                <th className="px-3 py-3">Billable Users</th>
                <th className="px-3 py-3">Start Date</th>
                <th className="px-3 py-3">End Date</th>
                <th className="px-3 py-3">Term</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-3 py-3">Service</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs">
              {subscriptions.map((subscription) => {
                const sub = subscription as SubscriptionRecord;
                const subPlanId = String(sub.planId || sub.plan_id || "").trim();

                const plan = plans.find((candidate) => {
                  const record = candidate as PlanRecord;
                  return String(record.id || record._id).trim() === subPlanId;
                }) as PlanRecord | undefined;
                const subId = sub.id || sub._id;

                const startStr = formatDateForInput(sub.start_date || sub.startDate);
                const endStr = formatDateForInput(sub.end_date || sub.endDate || sub.expireDate);

                return (
                  <tr key={subId} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold text-slate-900">
                      {sub.organizationName || sub.organization_name || "—"}
                      {sub.organizationMissing && <span className="mt-1 block text-[10px] font-semibold text-rose-700">Organization record missing</span>}
                    </td>
                    <td className="max-w-48 break-all px-3 py-3 font-mono text-[10px] text-slate-600">{sub.organizationPublicId || (sub.organizationMissing ? "Unavailable" : "—")}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums text-slate-700">{sub.organizationNumber || (sub.organizationMissing ? "Unavailable" : "—")}</td>
                    <td className="px-3 py-3">{sub.plan_name || plan?.name || plan?.plan_name || "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{sub.billed_user_count ?? "—"}</td>
                    <td className="px-3 py-3">{startStr || "—"}</td>
                    <td className="px-3 py-3">{endStr || "—"}</td>
                    <td className="px-3 py-3">{sub.billingMonths ? `${sub.billingMonths} months` : "—"}</td>
                    <td className="px-3 py-3">{sub.totalAmount != null ? `₹${Number(sub.totalAmount).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-3 py-3"><span className="uppercase font-bold">{sub.payment_status || sub.paymentStatus}</span></td>
                    <td className="px-3 py-3"><span className="uppercase font-bold">{sub.service_status || sub.serviceStatus || "active"}</span></td>
                    <td className="px-3 py-3 text-right space-x-2">
                      {String(sub.payment_status || sub.paymentStatus || "").toLowerCase() !== "paid" && (
                        <form action={updateStatus} className="inline">
                          <input type="hidden" name="id" value={subId} />
                          <FormSubmitButton variant="secondary" size="sm" pendingLabel="Approving..." className="rounded border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-100">Approve</FormSubmitButton>
                        </form>
                      )}
                      {sub.business_type_id && <a href={`/platform/subscriptions?edit=${subId}`} className="text-emerald-600 font-semibold">Edit</a>}
                      <form action={remove} className="inline" title={sub.organizationMissing ? "Delete orphaned subscription and record the action in platform audit" : "Delete subscription"}>
                        <input type="hidden" name="id" value={subId} />
                        <FormSubmitButton variant="ghost" size="sm" pendingLabel="Deleting..." className="text-red-600 hover:bg-red-50">Delete</FormSubmitButton>
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