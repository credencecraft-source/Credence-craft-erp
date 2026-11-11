import { TakeUniformMeasurementsRoute } from "../_page-content/uniform-management-route-pages";

export default function TakeMeasurementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TakeUniformMeasurementsRoute params={params} searchParams={searchParams} />;
}
