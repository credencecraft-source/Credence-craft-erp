import Link from "next/link";

import Card from "@/components/ui/Card";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn`;

  return (
    <UiPage as="div">
      <Section className="space-y-6">
        <Card>
          <h1 className="text-2xl font-bold text-slate-900">Allocation</h1>
          <p className="mt-2 text-sm text-slate-600">Accepted raw material allocation records will appear here.</p>
        </Card>
      </Section>
    </UiPage>
  );
}
