// @/app/platform/plans/[id]/restrictions/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/database/prisma-client";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { listPlans } from "@/lib/services/platform/plan-service";
import { RestrictionForm } from "@/components/platform/restriction-form";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; success?: string; showModal?: string }>;
}

async function saveRestrictionAction(planId: string, formData: FormData) {
  "use server";
  await requirePlatformSessionAdmin();
  const masterModule = String(formData.get("masterModule") || "").trim();
  const mainModule = String(formData.get("mainModule") || "").trim();
  const subModule = String(formData.get("subModule") || "").trim();
  const actionLevel = String(formData.get("actionLevel") || "*").trim();
  const restrictionType = String(formData.get("restrictionType") || "block");
  const customMessage = String(formData.get("customMessage") || "").trim();

  if (!masterModule || !mainModule || !subModule) {
    redirect(`/platform/plans/${planId}/restrictions?error=` + encodeURIComponent("Master, Main, and Sub modules are required."));
  }

  const formattedMaster = masterModule.toLowerCase().replace(/\s+/g, "-");
  const formattedMain = mainModule.toLowerCase().replace(/\s+/g, "-");
  const formattedSub = subModule.toLowerCase().replace(/\s+/g, "-");
  const formattedAction = actionLevel.toLowerCase().replace(/\s+/g, "-");
  const urlPattern = `/dashboard/*/organizations/*/${formattedMaster}/${formattedMain}/${formattedSub}/${formattedAction}`;

  const defaultMsg = `Access to ${masterModule} › ${mainModule} › ${subModule} is restricted on your current plan.`;

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
        custom_message: customMessage || defaultMsg,
      },
    });
  } catch (error: any) {
    redirect(`/platform/plans/${planId}/restrictions?error=` + encodeURIComponent(error.message || "Failed to save restriction"));
  }

  redirect(`/platform/plans/${planId}/restrictions?success=` + encodeURIComponent("Restriction rule added successfully."));
}

async function deleteRestrictionAction(planId: string, formData: FormData) {
  "use server";
  await requirePlatformSessionAdmin();
  const restrictionId = String(formData.get("restrictionId") || "");
  try {
    await prisma.plan_restrictions.delete({
      where: { restriction_id: restrictionId },
    });
  } catch (error: any) {
    redirect(`/platform/plans/${planId}/restrictions?error=` + encodeURIComponent(error.message || "Failed to delete restriction"));
  }
  redirect(`/platform/plans/${planId}/restrictions?success=` + encodeURIComponent("Restriction rule removed successfully."));
}

export default async function PlanRestrictionsPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const planId = resolvedParams.id;
  const resolvedSearch = (await searchParams) ?? {};
  
  const plans = await listPlans();
  const plan = plans.find((p: any) => p.id === planId);

  if (!plan) {
    redirect("/platform/plans?error=" + encodeURIComponent("Plan not found"));
  }

  const restrictions = await prisma.plan_restrictions.findMany({
    where: { plan_id: planId },
    orderBy: { created_at: "desc" },
  });

  const isModalOpen = resolvedSearch.showModal === "true";
  const handleSave = saveRestrictionAction.bind(null, planId);
  const handleDelete = deleteRestrictionAction.bind(null, planId);

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

        <Card className="p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Configured Hierarchy Restrictions</h2>
          <Table>
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-3">Module Path</th>
                <th className="px-3 py-3">Custom Alert Message</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs">
              {restrictions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400 italic">
                    No restrictions configured yet.
                  </td>
                </tr>
              ) : (
                restrictions.map((item: any) => (
                  <tr key={item.restriction_id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {item.master_module} › {item.main_module} › {item.sub_module}
                    </td>
                    <td className="px-3 py-3 text-slate-600 italic">
                      &ldquo;{item.custom_message}&rdquo;
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded font-bold uppercase ${item.restriction_type === 'block' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                        {item.restriction_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <form action={handleDelete}>
                        <input type="hidden" name="restrictionId" value={item.restriction_id} />
                        <button type="submit" className="text-red-600 font-semibold cursor-pointer hover:underline">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-6 border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add Hierarchical Restriction Rule</h3>
                  <p className="text-xs text-slate-500">Configure modules and custom alert message.</p>
                </div>
                <Link 
                  href={`/platform/plans/${planId}/restrictions`}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                >
                  ✕
                </Link>
              </div>

              <RestrictionForm planId={planId} saveAction={handleSave} />
            </div>
          </div>
        )}
      </Section>
    </Page>
  );
}