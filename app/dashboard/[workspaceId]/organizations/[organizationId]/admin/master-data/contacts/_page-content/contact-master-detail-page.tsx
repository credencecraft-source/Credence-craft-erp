import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { getContact } from "@/lib/services/master-data/contact-master-service";
import {
  ContactRoleSettingsUnavailableError,
  getContactCommonRoleModes,
} from "@/lib/services/master-data/contact-role-settings-service";

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
  let initialCommonRoleSettings: Record<string, boolean> | null;
  let roleSettingsError: string | undefined;
  try {
    initialCommonRoleSettings = await getContactCommonRoleModes(
      organization.id,
      contact.id,
      contact.roles.map(({ role_code }) => role_code),
    );
  } catch (error) {
    if (!(error instanceof ContactRoleSettingsUnavailableError)) throw error;
    initialCommonRoleSettings = null;
    roleSettingsError = error.message;
  }

  return (
    <ContactMasterRecordPage
      key={contact.id}
      organizationId={organizationId}
      workspaceId={workspaceId}
      contactId={contactId}
      initialContact={contact}
      initialCommonRoleSettings={initialCommonRoleSettings}
      roleSettingsError={roleSettingsError}
    />
  );
}
