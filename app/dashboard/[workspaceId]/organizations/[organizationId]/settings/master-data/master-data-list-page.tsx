import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { MASTER_DEFINITIONS, MASTER_MODULE_HIERARCHY, getMasterModuleGroupInfo } from "@/lib/master-data/master-data-registry";

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

  const groupedMasters = MASTER_DEFINITIONS.filter((master) => !master.hidden).reduce<Record<string, Record<string, typeof MASTER_DEFINITIONS[number][]>>>(
    (accumulator, master) => {
      const { topLevel, topLevelLabel, subLevel, subLevelLabel } = getMasterModuleGroupInfo(master.key);

      if (!accumulator[topLevel]) {
        accumulator[topLevel] = {};
      }

      if (!accumulator[topLevel][subLevel]) {
        accumulator[topLevel][subLevel] = [];
      }

      accumulator[topLevel][subLevel].push(master);
      accumulator[topLevel][subLevel].sort((left, right) => (left.moduleOrder ?? 999) - (right.moduleOrder ?? 999));
      accumulator[topLevel]["__meta"] ??= { label: topLevelLabel };
      accumulator[topLevel]["__meta__sub"] ??= { [subLevel]: subLevelLabel };

      return accumulator;
    },
    {} as Record<string, Record<string, typeof MASTER_DEFINITIONS[number][] | { label: string }>>,
  );

  const orderedGroups = Object.entries(MASTER_MODULE_HIERARCHY).map(([topLevelKey, topLevelConfig]) => ({
    key: topLevelKey,
    label: topLevelConfig.label,
    subGroups: Object.entries(topLevelConfig.children).map(([subKey, subLabel]) => ({
      key: subKey,
      label: subLabel,
      masters: groupedMasters[topLevelKey]?.[subKey] ?? [],
    })).filter((group) => group.masters.length > 0),
  })).filter((group) => group.subGroups.length > 0);

  const ungroupedMasters = MASTER_DEFINITIONS.filter((master) => !master.hidden && !master.moduleGroup && !master.moduleSubGroup);

  return (
    <Page as="div">
      <Section className="space-y-8">
        <div>
          <Badge>Master Registry</Badge>

          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            Master Modules
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Organised to follow the ERP structure used in the app. Each master sits inside the same module hierarchy used in the left sidebar, with nested groups such as Factory Management → Pre Production → Production.
          </p>
        </div>

        <div className="space-y-8">
          {orderedGroups.map((moduleGroup) => (
            <div key={moduleGroup.key} className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {moduleGroup.label}
                </p>
              </div>

              <div className="space-y-6">
                {moduleGroup.subGroups.map((subGroup) => (
                  <div key={`${moduleGroup.key}-${subGroup.key}`} className="space-y-3">
                    <h2 className="text-lg font-bold text-slate-900">
                      {subGroup.label}
                    </h2>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {subGroup.masters.map((master) => (
                        <Link
                          key={master.key}
                          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${master.key}`}
                          className="group block"
                        >
                          <Card className="h-full transition-all duration-200 hover:border-emerald-300 hover:shadow-md">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                                Master
                              </p>

                              <Badge>Active</Badge>
                            </div>

                            <h3 className="mt-3 text-xl font-bold text-slate-900">
                              {master.label}
                            </h3>

                            <p className="mt-2 text-sm text-slate-600">
                              {master.description}
                            </p>

                            <div className="mt-6 flex items-center justify-between">
                              <span className="text-sm font-semibold text-emerald-700">
                                Open Module
                              </span>

                              <span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-1">
                                →
                              </span>
                            </div>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {ungroupedMasters.length > 0 && (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  General
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {ungroupedMasters.map((master) => (
                  <Link
                    key={master.key}
                    href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${master.key}`}
                    className="group block"
                  >
                    <Card className="h-full transition-all duration-200 hover:border-emerald-300 hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                          Master
                        </p>

                        <Badge>Active</Badge>
                      </div>

                      <h3 className="mt-3 text-xl font-bold text-slate-900">
                        {master.label}
                      </h3>

                      <p className="mt-2 text-sm text-slate-600">
                        {master.description}
                      </p>

                      <div className="mt-6 flex items-center justify-between">
                        <span className="text-sm font-semibold text-emerald-700">
                          Open Module
                        </span>

                        <span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-1">
                          →
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    </Page>
  );
}
