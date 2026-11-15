import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";

import ContactMasterRecordPage from "./contact-master-record-page";

export default async function ContactMasterCreatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUserWithPermission(user.id, organizationId, "MANAGE_MASTER_DATA");
  if (!organization) notFound();

  return <ContactMasterRecordPage organizationId={organizationId} workspaceId={workspaceId} createMode />;
}
