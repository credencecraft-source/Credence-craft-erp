import { UniformMeasurementGroupDetailRoute } from "../../_page-content/uniform-management-route-pages";

export default function UniformMeasurementGroupDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; groupId: string }>;
}) {
  return <UniformMeasurementGroupDetailRoute params={params} />;
}
