import FactoryManagementStagePage from "./factory-management-stage-page";
import WorkOrderForm from "./work-order-form";

export default async function FactoryManagementWorkOrderCreatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  return (
    <FactoryManagementStagePage
      params={params}
      area="Pre Production"
      title="Create Work Order"
      description="Choose an Order No. or Article No. lookup, then allocate the work order quantities by size."
      content={<WorkOrderForm workspaceId={workspaceId} organizationId={organizationId} showReport={false} />}
    />
  );
}