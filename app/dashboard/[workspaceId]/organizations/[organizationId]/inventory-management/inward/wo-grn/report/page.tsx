import Link from "next/link";

import EmptyReportGrid from "@/components/reports/empty-report-grid";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/wo-grn`;

  return (
    <UiPage as="div">
      <Section className="space-y-6">
        <EmptyReportGrid
          title="WO GRN Report"
          fields={[{ key: "grnNo", label: "GRN No" }, { key: "workOrderNo", label: "Work Order" }, { key: "receivedDate", label: "Received Date" }, { key: "status", label: "Status" }]}
          storageKey={`credence-craft-wo-grn-${organizationId}`}
          emptyMessage="No work-order GRN records found."
        />
      </Section>
    </UiPage>
  );
}
