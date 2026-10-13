import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

import MasterImportJobReportPage from "./_page-content/master-import-job-report-page";

export default async function MasterImportJobReportRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; jobId: string }>;
}) {
  const { workspaceId, organizationId, jobId } = await params;
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
        fields: fields.filter((field) => !field.readOnly).map(({ key: fieldKey, label: fieldLabel, type, multiple }) => ({
          key: fieldKey,
          label: fieldLabel,
          type,
          multiple,
        })),
      })),
  ];

  return (
    <MasterImportJobReportPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      jobId={jobId}
      modules={modules}
    />
  );
}
