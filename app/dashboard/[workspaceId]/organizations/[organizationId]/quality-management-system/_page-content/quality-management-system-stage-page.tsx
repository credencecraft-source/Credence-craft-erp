import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type QualityManagementSystemStagePageProps = {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  area: string;
  title: string;
  description: string;
};

export default async function QualityManagementSystemStagePage({
  params,
  area,
  title,
  description,
}: QualityManagementSystemStagePageProps) {
  const { workspaceId, organizationId } = await params;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/quality-management-system`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{area}</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
        </div>

        <Card className="border-dashed border-slate-300 bg-white">
          <p className="text-sm font-semibold text-slate-900">Quality workspace ready</p>
          <p className="mt-2 text-sm text-slate-600">
            This workspace is connected to the Quality Management System navigation and is ready for its inspection forms and records.
          </p>
          <Link href={basePath} className="mt-5 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            Back to Quality Management System -&gt;
          </Link>
        </Card>
      </Section>
    </Page>
  );
}
