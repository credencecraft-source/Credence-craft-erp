import { notFound, redirect } from "next/navigation";

import ArticleRecordEditor from "./article-record-editor";
import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getActiveOrganizationDummyDataBatch,
  getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization,
} from "@/lib/master-data/master-data-constants";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { createMasterValueAction, updateMasterValueAction } from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/settings/master-data/[moduleKey]/master-data-editor-page";

type PageProps = {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    recordCode?: string;
    moduleKey?: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ArticleEditorPage({ params, searchParams }: PageProps) {
  const [{ workspaceId, organizationId, recordCode, moduleKey }, query] = await Promise.all([params, searchParams]);
  if (moduleKey && moduleKey !== "article") notFound();
  const editing = Boolean(recordCode);
  const editMode = !editing || firstSearchParam(query.mode) === "edit";

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const recordResults = recordCode
    ? await getMasterValuesForOrganization(organization.id, "article", true, {
        limit: 1,
        includeArticleMetrics: false,
        ...(/^[\da-f-]{36}$/i.test(recordCode)
          ? { search: recordCode, exactSearch: true }
          : { articleCode: recordCode }),
      })
    : [];
  const normalizedRecordCode = recordCode?.trim().toLocaleLowerCase();
  const record = recordCode
    ? recordResults.find((item) => item.value_id === recordCode
      || (item.code && item.code.toLocaleLowerCase() === normalizedRecordCode)) ?? null
    : null;
  if (recordCode && !record) notFound();

  const lookupKeys = ["brand", "product-master", "category", "sub-category", "size-group", "color"];
  const activeDummyDataBatch = getActiveOrganizationDummyDataBatch(organization.id);
  const [lookupEntries, sizeLinks] = editMode
    ? await Promise.all([
        Promise.all(lookupKeys.map(async (key) => {
          const values = await getMasterValuesForOrganization(organization.id, key, true, { limit: 500, activeDummyDataBatch });
          return [key, values.map((item) => ({
            id: item.id,
            value_id: item.value_id,
            label: item.label,
            parent_id: item.parent_id,
            fields: {
              Product_Master: item.fields.Product_Master ?? null,
              category: item.fields.category ?? null,
            },
          }))] as const;
        })),
        getSizeGroupSizesForOrganization(organization.id),
      ])
    : [[], []] as const;
  const sizeGroupSizes = sizeLinks.reduce<Record<string, string[]>>((groups, item) => {
    (groups[item.groupId] ??= []).push(item.size.label);
    return groups;
  }, {});

  return (
    <ArticleRecordEditor
      workspaceId={workspaceId}
      organizationId={organizationId}
      record={record ? {
        value_id: record.value_id,
        code: record.code ?? "",
        label: record.label,
        fields: record.fields,
      } : null}
      readOnly={editing && !editMode}
      lookupOptions={Object.fromEntries(lookupEntries)}
      sizeGroupSizes={sizeGroupSizes}
      createAction={createMasterValueAction}
      updateAction={updateMasterValueAction}
      error={firstSearchParam(query.error)}
      saved={editing ? firstSearchParam(query.saved) : undefined}
    />
  );
}
