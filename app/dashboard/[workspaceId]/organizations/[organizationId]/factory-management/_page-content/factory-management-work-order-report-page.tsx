import FactoryManagementStagePage from "./factory-management-stage-page";
import WorkOrderReportTable from "./work-order-report-table";

export default async function FactoryManagementWorkOrderReportPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return (
    <FactoryManagementStagePage
      params={params}
      area="Pre Production"
      title="Work Order Report"
      description="Review created factory work orders with searchable, filterable report columns."
      content={<WorkOrderReportTable />}
    />
  );
}