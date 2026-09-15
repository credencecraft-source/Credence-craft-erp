import QualityManagementSystemStagePage from "./quality-management-system-stage-page";

export default function QualityManagementSystemFgQualityCheckPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return (
    <QualityManagementSystemStagePage
      params={params}
      area="Finished Goods"
      title="FG Quality Check"
      description="Inspect finished goods and record their release quality status."
    />
  );
}
