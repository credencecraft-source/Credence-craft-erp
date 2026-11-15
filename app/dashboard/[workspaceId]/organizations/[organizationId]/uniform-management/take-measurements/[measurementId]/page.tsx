import { UniformEmployeeMeasurementDetailRoute } from "../../_page-content/uniform-management-route-pages";

export default function UniformEmployeeMeasurementDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; measurementId: string }>;
}) {
  return <UniformEmployeeMeasurementDetailRoute params={params} />;
}
