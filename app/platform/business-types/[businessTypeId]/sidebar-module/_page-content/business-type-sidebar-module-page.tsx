import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  createBusinessTypeSidebarModule,
  getBusinessType,
} from "@/lib/services/platform/business-type-service";
import { getErpModuleForBusinessTypeName, type SubModuleOption } from "@/components/erp/erp-config-registry";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

function SidebarItemTree({
  items,
  basePath,
}: {
  items: SubModuleOption[];
  basePath: string;
}) {
  return (
    <ul className="space-y-2 border-l border-slate-200 pl-4">
      {items.map((item) => {
        const itemPath = `${basePath}/${item.pathSegment || item.key}`;
        return (
          <li key={item.key} className="space-y-2">
            <Link
              href={itemPath}
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              {item.label}
            </Link>
            {item.children && item.children.length > 0 && (
              <SidebarItemTree items={item.children} basePath={itemPath} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function BusinessTypeSidebarModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessTypeId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { businessTypeId } = await params;
  const query = await searchParams;
  const businessType = await getBusinessType(businessTypeId);

  if (!businessType) {
    notFound();
  }

  const erpModule = getErpModuleForBusinessTypeName(businessType.name);
  if (!erpModule) {
    notFound();
  }

  async function enableModuleAction() {
    "use server";
    try {
      await createBusinessTypeSidebarModule(businessTypeId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to enable the sidebar module.";
      redirect(`/platform/business-types/${businessTypeId}/sidebar-module?error=${encodeURIComponent(message)}`);
    }

    redirect(`/platform/business-types/${businessTypeId}/sidebar-module?success=${encodeURIComponent("Sidebar module enabled for all organizations.")}`);
  }

  return (
    <Page className="max-w-4xl">
      <Section className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Business Type</p>
            <h1 className="text-2xl font-bold text-slate-900">
              {businessType.name} Sidebar Module
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage the sidebar module and review the items available to organizations.
            </p>
          </div>
          <Link href="/platform/business-types" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            Back to Business Types
          </Link>
        </div>

        {query.error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
        {query.success && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{query.success}</p>}

        <Card className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">{erpModule.label}</h2>
              <p className="mt-1 text-sm text-slate-600">This module appears in the organization sidebar for this Business Type.</p>
            </div>
            <form action={enableModuleAction}>
              <Button type="submit">Enable Sidebar Module</Button>
            </form>
          </div>

          {erpModule.children.length > 0 ? (
            <SidebarItemTree items={erpModule.children} basePath={`/${erpModule.pathSegment}`} />
          ) : (
            <p className="text-sm text-slate-500">No child sidebar items have been configured for this module.</p>
          )}
        </Card>
      </Section>
    </Page>
  );
}