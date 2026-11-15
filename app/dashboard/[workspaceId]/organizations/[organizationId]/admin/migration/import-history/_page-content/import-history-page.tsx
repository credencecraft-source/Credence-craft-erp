import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

import MasterImportHistory from "./master-import-history";

export default async function ImportHistoryPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();

  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const modules = [
    { key: "contact", label: "Contacts", fields: [] },
    ...MASTER_DEFINITIONS
      .filter((definition) => !definition.hidden)
      .map(({ key, label, fields }) => ({
        key,
        label,
        fields: fields.map(({ key: fieldKey, label: fieldLabel, type, readOnly, multiple }) => ({
          key: fieldKey,
          label: fieldLabel,
          type,
          readOnly: Boolean(readOnly),
          multiple: Boolean(multiple),
        })),
      })),
  ];

  return (
    <MasterImportHistory
      workspaceId={workspaceId}
      organizationId={organizationId}
      modules={modules}
    />
  );
}
