import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";
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

  const organization = await getOrganizationForUserWithPermission(
    user.id,
    organizationId,
    "MANAGE_MASTER_DATA",
  );
  if (!organization) notFound();
  const roleSettingsPromise = getContactCommonRoleModes(
    organization.id,
    contactId,
    ["CUSTOMER", "VENDOR", "AGENT", "DISTRIBUTOR", "DEALER"],
  ).then((commonRoleSettings) => ({ commonRoleSettings, error: undefined })).catch((error: unknown) => {
    if (!(error instanceof ContactRoleSettingsUnavailableError)) throw error;
    return { commonRoleSettings: null, error: error.message };
  });
  const [contact, roleSettings] = await Promise.all([
    getContact(organization.id, contactId),
    roleSettingsPromise,
  ]);
  if (!contact) notFound();
  const activeRoleCodes = new Set(contact.roles.map(({ role_code }) => role_code));
  const initialCommonRoleSettings = roleSettings.commonRoleSettings
    ? Object.fromEntries(Object.entries(roleSettings.commonRoleSettings)
      .filter(([roleCode]) => activeRoleCodes.has(roleCode)))
    : null;

  return (
    <ContactMasterRecordPage
      key={contact.id}
      organizationId={organizationId}
      workspaceId={workspaceId}
      contactId={contactId}
      initialContact={contact}
      initialCommonRoleSettings={initialCommonRoleSettings}
      roleSettingsError={roleSettings.error}
    />
  );
}
