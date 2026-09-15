import QualityManagementSystemStagePage from "./quality-management-system-stage-page";

export default function QualityManagementSystemRmQualityCheckPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return (
    <QualityManagementSystemStagePage
      params={params}
      area="Raw Material"
      title="RM Quality Check"
      description="Inspect incoming raw materials and record their quality approval status."
    />
  );
}
