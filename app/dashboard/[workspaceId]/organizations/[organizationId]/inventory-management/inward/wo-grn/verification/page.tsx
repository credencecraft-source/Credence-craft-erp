import Card from "@/components/ui/Card";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  await params;

  return (
    <UiPage as="div">
      <Section className="space-y-6">
        <Card>
          <h1 className="text-2xl font-bold text-slate-900">Verification</h1>
          <p className="mt-2 text-sm text-slate-600">Work-order verification tasks will appear here.</p>
        </Card>
      </Section>
    </UiPage>
  );
}
