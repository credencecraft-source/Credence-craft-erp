import { NewUniformEmployeeMeasurementRoute } from "../../_page-content/uniform-management-route-pages";

export default function NewUniformEmployeeMeasurementPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  return <NewUniformEmployeeMeasurementRoute params={params} />;
}
