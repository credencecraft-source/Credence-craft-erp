export default async function OnlineReadyStockPage({
  params: _params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  await _params;
  return null;
}