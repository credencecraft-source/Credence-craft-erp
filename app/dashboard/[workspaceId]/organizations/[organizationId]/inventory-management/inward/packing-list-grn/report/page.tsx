import EmptyReportGrid from "@/components/reports/empty-report-grid";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { organizationId } = await params;

  return (
    <UiPage as="div">
      <Section className="space-y-6">
        <EmptyReportGrid
          title="Packing List GRN Report"
          fields={[{ key: "grnNo", label: "GRN No" }, { key: "receivedDate", label: "Received Date" }, { key: "location", label: "Location" }, { key: "status", label: "Status" }]}
          storageKey={`credence-craft-packing-list-grn-${organizationId}`}
          emptyMessage="No packing list GRN records found."
        />
      </Section>
    </UiPage>
  );
}
