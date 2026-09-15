import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const qualityAreas = [
  {
    href: "quality-management-system/raw-material/rm-quality-check",
    label: "Raw Material",
    child: "RM Quality Check",
    description: "Inspect and record quality checks for incoming raw materials.",
  },
  {
    href: "quality-management-system/finished-goods/fg-quality-check",
    label: "Finished Goods",
    child: "FG Quality Check",
    description: "Verify finished goods quality before packing and dispatch.",
  },
];

export default async function QualityManagementSystemPage({
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Quality Management System</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Quality Management System</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Control quality checks for raw materials and finished goods across the production lifecycle.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {qualityAreas.map((area) => (
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
