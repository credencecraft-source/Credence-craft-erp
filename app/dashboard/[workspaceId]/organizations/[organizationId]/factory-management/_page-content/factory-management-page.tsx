import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const factoryAreas = [
  {
    href: "factory-management/pre-production/work-order",
    label: "Pre Production",
    child: "Work Order",
    description: "Prepare and release factory work orders before production begins.",
  },
  {
    href: "factory-management/production/shop-floor",
    label: "Production",
    child: "Shop Floor",
    description: "Track work in progress and daily production across factory operations.",
  },
  {
    href: "factory-management/post-production/scan-pack",
    label: "Post Production",
    child: "Scan Pack",
    description: "Scan, pack, and prepare completed production for dispatch.",
  },
];

export default async function FactoryManagementPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}`;

  return (
    <Page as="div">
      <Section className="space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Factory Management</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Factory Management</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Coordinate the production lifecycle from work order creation through the shop floor and final packing.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {factoryAreas.map((area) => (
            <Link key={area.href} href={`${basePath}/${area.href}`} className="group block">
              <Card className="h-full border-slate-200 transition-all duration-200 hover:border-emerald-300 hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{area.label}</p>
                <h2 className="mt-3 text-xl font-bold text-slate-900">{area.child}</h2>
                <p className="mt-2 text-sm text-slate-600">{area.description}</p>
                <span className="mt-6 inline-block text-sm font-semibold text-emerald-700 transition-transform group-hover:translate-x-1">
                  Open module -&gt;
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}
