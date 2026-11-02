import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUserWithPermission } from "@/lib/services/organizations/organization-service";
import { getContact } from "@/lib/services/master-data/contact-master-service";
import { getContactRoleSettings } from "@/lib/services/master-data/contact-role-settings-service";
import { getDistributorDealerMapping, getRoleMappingAssignment } from "@/lib/services/master-data/distributor-dealer-service";
import RoleSettingsPage from "../../../../../_page-content/role-settings-page";

export default async function IndividualRoleSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; contactId: string; roleName: string; mappingId: string }>;
}) {
  const { workspaceId, organizationId, contactId, roleName, mappingId } = await params;
  const normalizedRole = roleName.toUpperCase();
  if (!["AGENT", "DISTRIBUTOR", "DEALER"].includes(normalizedRole)) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUserWithPermission(user.id, organizationId, "MANAGE_MASTER_DATA");
  if (!organization) notFound();
  const contact = await getContact(organization.id, contactId);
  if (!contact || !mappingId) notFound();
  const mapping = normalizedRole === "DISTRIBUTOR"
    ? await getDistributorDealerMapping(organization.id, contactId, mappingId)
    : await getRoleMappingAssignment(organization.id, normalizedRole as "AGENT" | "DEALER", contactId, mappingId);
  if (!mapping) notFound();

  const mappedContactId = "dealer_id" in mapping ? mapping.dealer_id : mapping.mapped_contact_id;
  const initialSettings = await getContactRoleSettings(
    organization.id,
    contactId,
    normalizedRole,
    "individual",
    mappedContactId,
  );
  const backHref = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/contacts/${contactId}`;
  return (
    <RoleSettingsPage
      backHref={backHref}
      organizationId={organizationId}
      contactId={contactId}
      roleName={normalizedRole}
      scope="individual"
      recordId={mappedContactId}
      initialSettings={initialSettings}
    />
  );
}
