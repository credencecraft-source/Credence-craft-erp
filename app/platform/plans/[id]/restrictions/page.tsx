import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/database/prisma-client";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { listPlans } from "@/lib/services/platform/plan-service";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; success?: string; showModal?: string }>;
}

export default async function PlanRestrictionsPage({ params, searchParams }: PageProps) {
  const { id: planId } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  
  const plans = await listPlans();
  const plan = plans.find((p: any) => p.id === planId);

  if (!plan) {
    redirect("/platform/plans?error=" + encodeURIComponent("Plan not found"));
  }

  // Fetch restrictions from Prisma
  const restrictions = await prisma.plan_restrictions.findMany({
    where: { plan_id: planId },
    orderBy: { created_at: "desc" },
  });

  // Server action to save restriction configuration via Prisma
  async function saveRestrictionAction(formData: FormData) {
    "use server";
    const masterModule = String(formData.get("masterModule") || "").trim();
    const mainModule = String(formData.get("mainModule") || "").trim();
    const subModule = String(formData.get("subModule") || "").trim();
    const actionLevel = String(formData.get("actionLevel") || "*").trim();
    const restrictionType = String(formData.get("restrictionType") || "block");

    if (!masterModule || !mainModule || !subModule) {
      redirect(`/platform/plans/${planId}/restrictions?error=` + encodeURIComponent("Master, Main, and Sub modules are required."));
    }

    const formattedMaster = masterModule.toLowerCase().replace(/\s+/g, "-");
    const formattedMain = mainModule.toLowerCase().replace(/\s+/g, "-");
    const formattedSub = subModule.toLowerCase().replace(/\s+/g, "-");
    const formattedAction = actionLevel.toLowerCase().replace(/\s+/g, "-");
    const urlPattern = `/dashboard/*/organizations/*/${formattedMaster}/${formattedMain}/${formattedSub}/${formattedAction}`;

    try {
      await prisma.plan_restrictions.create({
        data: {
          plan_id: planId,
          master_module: masterModule,
          main_module: mainModule,
          sub_module: subModule,
          action_level: actionLevel,
          url_pattern: urlPattern,
          restriction_type: restrictionType,
        },
      });
    } catch (error: any) {
      redirect(`/platform/plans/${planId}/restrictions?error=` + encodeURIComponent(error.message || "Failed to save restriction"));
    }

    redirect(`/platform/plans/${planId}/restrictions?success=` + encodeURIComponent("Restriction rule added successfully."));
  }

  // Server action to remove restriction configuration via Prisma
  async function deleteRestrictionAction(formData: FormData) {
    "use server";
    const restrictionId = String(formData.get("restrictionId") || "");
    try {
      await prisma.plan_restrictions.delete({
        where: { id: restrictionId },
      });
    } catch (error: any) {
      redirect(`/platform/plans/${planId}/restrictions?error=` + encodeURIComponent(error.message || "Failed to delete restriction"));
    }
    redirect(`/platform/plans/${planId}/restrictions?success=` + encodeURIComponent("Restriction rule removed successfully."));
  }

  const isModalOpen = resolvedSearch.showModal === "true";

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="erp-eyebrow">Platform Admin</p>
            <h1 className="text-2xl font-bold text-slate-900">Manage Multi-Level Restrictions</h1>
            <p className="text-sm text-slate-600">Plan: <span className="font-semibold text-slate-900">{plan.plan_name}</span> ({planId})</p>
          </div>
          <div className="flex items-center gap-3">
            <Link 
              href={`/platform/plans/${planId}/restrictions?showModal=true`}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              + Add New Restriction
            </Link>
            <Link href="/platform/plans" className="text-xs text-slate-600 font-semibold border px-3 py-2 rounded-lg hover:bg-slate-50">
              ← Back to Plans
            </Link>
          </div>
        </div>

        {resolvedSearch.error && <p className="p-3 bg-red-50 text-red-700 text-xs rounded-xl">{resolvedSearch.error}</p>}
        {resolvedSearch.success && <p className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl">{resolvedSearch.success}</p>}

        {/* Configured Restrictions Table */}
        <Card className="p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Configured Hierarchy Restrictions</h2>
          <Table>
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3">Master Module</th>
                <th className="px-3 py-3">Main Module</th>
                <th className="px-3 py-3">Sub Module</th>
                <th className="px-3 py-3">Action Level</th>
                <th className="px-3 py-3">Generated URL Pattern</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs">
              {restrictions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400 italic">
                    No restrictions configured yet. Click &quot;+ Add New Restriction&quot; above.
                  </td>
                </tr>
              ) : (
                restrictions.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold text-slate-900">{item.master_module}</td>
                    <td className="px-3 py-3 text-slate-700">{item.main_module}</td>
                    <td className="px-3 py-3 text-slate-700">{item.sub_module}</td>
                    <td className="px-3 py-3 font-mono text-[11px]">{item.action_level}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-500">{item.url_pattern}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded font-bold uppercase ${item.restriction_type === 'block' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                        {item.restriction_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <form action={deleteRestrictionAction}>
                        <input type="hidden" name="restrictionId" value={item.id} />
                        <button type="submit" className="text-red-600 font-semibold cursor-pointer hover:underline">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        {/* Popup Modal for Adding Restriction */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-6 border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add Hierarchical Restriction Rule</h3>
                  <p className="text-xs text-slate-500">Type exact naming parameters to block or hide URLs.</p>
                </div>
                <Link 
                  href={`/platform/plans/${planId}/restrictions`}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                >
                  ✕
                </Link>
              </div>

              <form action={saveRestrictionAction} className="space-y-4">
                <Input 
                  label="Master Module" 
                  name="masterModule" 
                  required 
                  placeholder="e.g. order-management" 
                />

                <Input 
                  label="Main Module" 
                  name="mainModule" 
                  required 
                  placeholder="e.g. merchandising" 
                />

                <Input 
                  label="Sub Module" 
                  name="subModule" 
                  required 
                  placeholder="e.g. order" 
                />

                <Input 
                  label="Action / Sub Level" 
                  name="actionLevel" 
                  required 
                  placeholder="e.g. create or *" 
                />

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-700">Restriction Type</label>
                  <select name="restrictionType" className="w-full border p-2 text-xs rounded-lg bg-white">
                    <option value="block">Block Access</option>
                    <option value="hide">Hide Element / Module</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Link 
                    href={`/platform/plans/${planId}/restrictions`}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </Link>
                  <Button type="submit">Save Rule</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Section>
    </Page>
  );
}