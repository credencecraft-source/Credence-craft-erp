import Link from "next/link";
import { notFound } from "next/navigation";
import Page from "@/components/ui/Page";
import Card from "@/components/ui/Card";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export default async function OrganizationSettingsPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/settings`;
  return <Page><Section className="space-y-6"><div><p className="erp-eyebrow">Organization Settings</p><h1 className="erp-page-heading">{organization.organization_name}</h1><p className="erp-page-subheading">Manage organization access and reporting.</p></div><div className="grid gap-4 md:grid-cols-2"><Link href={`${base}/users`}><Card className="transition hover:border-emerald-300"><h2 className="text-lg font-bold text-slate-900">Users</h2><p className="mt-2 text-sm text-slate-600">Create workspace users, invite them, and manage organization roles.</p></Card></Link><Link href={`${base}/roles`}><Card className="transition hover:border-emerald-300"><h2 className="text-lg font-bold text-slate-900">Roles & Permissions</h2><p className="mt-2 text-sm text-slate-600">Configure ERP permissions available to each organization role.</p></Card></Link><Link href={`${base}/reports`}><Card className="transition hover:border-emerald-300"><h2 className="text-lg font-bold text-slate-900">Reports</h2><p className="mt-2 text-sm text-slate-600">Review organization reporting activity.</p></Card></Link><Link href={`${base}/pricing/plan`}><Card className="transition hover:border-emerald-300"><h2 className="text-lg font-bold text-slate-900">Pricing & Subscriptions</h2><p className="mt-2 text-sm text-slate-600">Manage the organization plan.</p></Card></Link></div></Section></Page>;
}
