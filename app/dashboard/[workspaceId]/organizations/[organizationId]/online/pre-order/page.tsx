export default async function OnlinePreOrderPage({
  params: _params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  await _params;
  return null;
}