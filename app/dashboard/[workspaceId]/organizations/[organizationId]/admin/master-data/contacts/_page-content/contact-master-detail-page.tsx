import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { getContact } from "@/lib/services/master-data/contact-master-service";

import ContactMasterRecordPage from "./contact-master-record-page";

export default async function ContactMasterDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; contactId: string }>;
}) {
  const { workspaceId, organizationId, contactId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
  const contact = await getContact(organization.id, contactId);
  if (!contact) notFound();

  return (
    <ContactMasterRecordPage
      key={contact.id}
      organizationId={organizationId}
      workspaceId={workspaceId}
      contactId={contactId}
      initialContact={contact}
    />
  );
}
