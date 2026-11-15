import { UniformMeasurementGroupsRoute } from "../_page-content/uniform-management-route-pages";

export default function GroupedUniformMeasurementsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return <UniformMeasurementGroupsRoute params={params} />;
}
