import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization,
} from "@/lib/master-data/master-data-constants";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { updateMasterValueAction } from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/settings/master-data/[moduleKey]/master-data-editor-page";
import SizeGroupRecordEditor from "./size-group-record-editor";

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SizeGroupRecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; recordCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspaceId, organizationId, recordCode }, query] = await Promise.all([params, searchParams]);
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const [records, brands, charts, availableSizes] = await Promise.all([
    getMasterValuesForOrganization(organization.id, "size-group", true, {
      search: recordCode,
      exactSearch: true,
      includeDummyData: true,
      limit: 1,
    }),
    getMasterValuesForOrganization(organization.id, "brand", true, { includeDummyData: true, limit: 500 }),
    getMasterValuesForOrganization(organization.id, "measurement-chart", true, { includeDummyData: true, limit: 500 }),
    getMasterValuesForOrganization(organization.id, "size", true, { includeDummyData: true, limit: 500 }),
  ]);
  const record = records.find((item) => item.id === recordCode || item.value_id === recordCode);
  if (!record) notFound();

  const links = await getSizeGroupSizesForOrganization(organization.id, [record.id], true);
  return (
    <SizeGroupRecordEditor
      workspaceId={workspaceId}
      organizationId={organizationId}
      record={{
        id: record.id,
        valueId: record.value_id,
        label: record.label,
        brand: String(record.fields.Brand1 ?? ""),
        measurementChart: String(record.fields.Measurement_Chart1 ?? ""),
        sizes: links.map((item) => item.size.label),
      }}
      brandOptions={brands.map((item) => ({ label: item.label }))}
      measurementChartOptions={charts.map((item) => ({ label: item.label }))}
      sizeOptions={availableSizes.map((item) => ({ label: item.label }))}
      updateAction={updateMasterValueAction}
      error={firstSearchParam(query.error)}
      saved={firstSearchParam(query.saved)}
    />
  );
}
