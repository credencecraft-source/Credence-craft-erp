import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";
import { getContact } from "@/lib/services/master-data/contact-master-service";
import { getContactRoleSettings } from "@/lib/services/master-data/contact-role-settings-service";
import RoleSettingsPage from "../../../../_page-content/role-settings-page";

export default async function CommonRoleSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; contactId: string; roleName: string }>;
}) {
  const { workspaceId, organizationId, contactId, roleName } = await params;
  const normalizedRole = roleName.toUpperCase();
  if (!["CUSTOMER", "VENDOR", "AGENT", "DISTRIBUTOR", "DEALER"].includes(normalizedRole)) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUserWithPermission(user.id, organizationId, "MANAGE_MASTER_DATA");
  if (!organization) notFound();
  const contact = await getContact(organization.id, contactId);
  if (!contact) notFound();
  if (!contact.roles.some((role) => role.role_code === normalizedRole)) notFound();

  const initialSettings = await getContactRoleSettings(
    organization.id,
    contactId,
    normalizedRole,
    "common",
  );
  const backHref = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts/${contactId}`;
  return (
    <RoleSettingsPage
      backHref={backHref}
      organizationId={organizationId}
      contactId={contactId}
      roleName={normalizedRole}
      scope="common"
      initialSettings={initialSettings}
    />
  );
}
