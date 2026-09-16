import Link from "next/link";

import Card from "@/components/ui/Card";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/wo-grn`;

  return (
    <UiPage as="div">
      <Section className="space-y-6">
        <Link href={basePath} className="text-xs font-semibold text-emerald-700">&larr; WO GRN</Link>
        <Card>
          <h1 className="text-2xl font-bold text-slate-900">WO GRN Report</h1>
          <p className="mt-2 text-sm text-slate-600">Work-order GRN records will appear here.</p>
        </Card>
      </Section>
    </UiPage>
  );
}
