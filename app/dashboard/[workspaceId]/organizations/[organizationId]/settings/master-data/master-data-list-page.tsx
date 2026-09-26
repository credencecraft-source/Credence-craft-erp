import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { getMasterModuleGroupInfo, MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";

export default async function MasterDataListPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(
    user.id,
    organizationId,
  );

  if (!organization) {
    notFound();
  }

  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const masters = MASTER_DEFINITIONS
    .filter((master) => !master.hidden)
    .sort((left, right) => (left.moduleOrder ?? 999) - (right.moduleOrder ?? 999));
  const masterGroups = masters.reduce<Array<{ key: string; label: string; children: Array<{ key: string; label: string; masters: typeof masters }> }>>((groups, master) => {
    const { topLevel, topLevelLabel, subLevel, subLevelLabel } = getMasterModuleGroupInfo(master.key);
    let topGroup = groups.find((group) => group.key === topLevel);
    if (!topGroup) {
      topGroup = { key: topLevel, label: topLevelLabel, children: [] };
      groups.push(topGroup);
    }
    let subGroup = topGroup.children.find((group) => group.key === subLevel);
    if (!subGroup) {
      subGroup = { key: subLevel, label: subLevelLabel, masters: [] };
      topGroup.children.push(subGroup);
    }
    subGroup.masters.push(master);
    return groups;
  }, []);

  return (
    <Page as="div">
      <Section className="space-y-8">
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup`}
          className="block rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 transition hover:border-emerald-400 hover:bg-emerald-100"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">One-time setup</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Organization Master Setup</h2>
          <p className="mt-1 text-sm text-slate-700">Create starter RM category types, categories, brands, and buyers together.</p>
        </Link>

        <div className="space-y-8">
          {masterGroups.map((topGroup) => (
            <section key={topGroup.key} aria-labelledby={`master-group-${topGroup.key}`}>
              <div className="mb-3 border-b border-slate-200 pb-2">
                <h2 id={`master-group-${topGroup.key}`} className="text-lg font-bold text-slate-900">{topGroup.label}</h2>
              </div>
              <div className="space-y-5">
                {topGroup.children.map((subGroup) => (
                  <div key={`${topGroup.key}-${subGroup.key}`}>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{subGroup.label}</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {subGroup.masters.map((master) => (
                        <Link
                          key={master.key}
                          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${master.key}`}
                          className="group block"
                        >
                          <Card className="h-full px-3 py-3 transition-all duration-200 hover:border-emerald-300 hover:shadow-md">
                            <h4 className="text-sm font-bold leading-tight text-slate-900">{master.label}</h4>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-xs font-semibold text-emerald-700">Open</span>
                              <span aria-hidden="true" className="text-sm transition-transform group-hover:translate-x-1">→</span>
                            </div>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Section>
    </Page>
  );
}
