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
      description="Create partial work orders against an order number until every size quantity is allocated."
      content={<WorkOrderForm workspaceId={workspaceId} organizationId={organizationId} showReport={false} />}
    />
  );
}