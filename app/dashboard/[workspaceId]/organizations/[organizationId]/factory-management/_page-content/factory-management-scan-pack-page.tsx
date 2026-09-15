import FactoryManagementStagePage from "./factory-management-stage-page";

export default function FactoryManagementScanPackPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return (
    <FactoryManagementStagePage
      params={params}
      area="Post Production"
      title="Scan Pack"
      description="Scan and pack finished goods for dispatch after production is complete."
    />
  );
}
