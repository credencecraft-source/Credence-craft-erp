export default async function OnlineB2BDashboardPage({
  params: _params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  await _params;
  return null;
}