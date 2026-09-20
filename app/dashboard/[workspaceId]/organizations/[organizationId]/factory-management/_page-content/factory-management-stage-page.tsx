import Link from "next/link";
import type { ReactNode } from "react";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type FactoryManagementStagePageProps = {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  area: string;
  title: string;
  description: string;
  content?: ReactNode;
};

export default async function FactoryManagementStagePage({
  params,
  area,
  title,
  description,
  content,
}: FactoryManagementStagePageProps) {
  const { workspaceId, organizationId } = await params;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{area}</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
        </div>

        {content ?? <Card className="border-dashed border-slate-300 bg-white">
          <p className="text-sm font-semibold text-slate-900">Module workspace ready</p>
          <p className="mt-2 text-sm text-slate-600">
            This workspace is connected to the Factory Management navigation and is ready for its operational forms and records.
          </p>
        </Card>}
      </Section>
    </Page>
  );
}
