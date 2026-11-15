import { redirect } from "next/navigation";

type LegacySetupSearchParams = Record<string, string | string[] | undefined>;

export default async function LegacyOrganizationMasterSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<LegacySetupSearchParams>;
}) {
  const [{ workspaceId, organizationId }, queryParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(queryParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  redirect(
    `/dashboard/${workspaceId}/organizations/${organizationId}/admin/migration/direct${queryString ? `?${queryString}` : ""}`,
  );
}
