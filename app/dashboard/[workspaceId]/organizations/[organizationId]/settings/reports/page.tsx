import Link from "next/link";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function OrganizationReportsPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  return <Page><Section className="space-y-4"><Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings`} className="text-sm font-semibold text-emerald-700">Back to Settings</Link><div><p className="erp-eyebrow">Organization Settings</p><h1 className="erp-page-heading">Reports</h1><p className="erp-page-subheading">Reporting workspace is ready for organization-specific reports.</p></div><div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No reports are available yet.</div></Section></Page>;
}
