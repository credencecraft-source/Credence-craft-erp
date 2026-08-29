import { redirect } from "next/navigation";

export default async function WorkspaceOrganizationOrderManagementPage({
  params,
}: {
  params: Promise<{ username: string; organization: string }>;
}) {
  const { username, organization } = await params;
  const decodedUsername = decodeURIComponent(username ?? "");
  const orgSlug = organization ? encodeURIComponent(organization) : "organization";

  redirect(`/workspace/${decodedUsername}/${orgSlug}/order-management/merchandising`);
}
