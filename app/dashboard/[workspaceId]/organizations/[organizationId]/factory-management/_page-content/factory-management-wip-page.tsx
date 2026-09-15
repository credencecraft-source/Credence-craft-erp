import FactoryManagementStagePage from "./factory-management-stage-page";

export default function FactoryManagementWipPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return (
    <FactoryManagementStagePage
      params={params}
      area="Production"
      title="WIP"
      description="Monitor work in progress as factory orders move through production operations."
    />
  );
}
