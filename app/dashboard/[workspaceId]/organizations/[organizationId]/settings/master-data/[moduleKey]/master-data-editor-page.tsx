import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { MasterRecordsTable } from "@/components/master-data/master-records-data-table";
import PriceListSettingsPage from "./_page-content/price-list-settings-page";
import PriceListTypesHome from "../../../admin/master-data/[moduleKey]/_page-content/price-list-types-home";
import PriceListContactReport from "../../../admin/master-data/[moduleKey]/[recordCode]/_page-content/price-list-contact-report";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { groupArticleMatrixRows } from "@/lib/master-data/article-import-workbook";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  MASTER_DEFINITIONS,
  createMasterValueForOrganization,
  deleteMasterValue,
  deleteSelectedMasterValuesForOrganization,
  getMasterDefinition,
  getMasterValuesForOrganization,
  getActiveOrganizationDummyDataBatch,
  getSizeGroupSizesForOrganization,
  syncSizeGroupSizes,
  updateMasterValue,
} from "@/lib/master-data/master-data-constants";
import {
  parseMasterRecordsWorkbook,
  validateCorrectedMasterWorkbookRows,
  validateMasterWorkbookLookupValues,
  type MasterRecordsImportResult,
  type MasterWorkbookLookupOption,
  type ParsedMasterWorkbookRow,
} from "@/lib/master-data/master-records-workbook";
import type { MasterFieldValues } from "@/lib/master-data/master-data-constants";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-registry";
import {
  getMissingRequiredFieldLabels,
  getRequiredFieldsErrorMessage,
} from "@/lib/master-data/required-field-validation";
import {
  loadArticleImportSupportingMasterIndex,
  validateArticleImportSupportingMasters,
} from "@/lib/services/master-data/master-import-service";
import { parseFinishedGoodsSizePrices } from "@/lib/services/master-data/finished-goods-size-service";

function serializeDecimal(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value && "toString" in value
    && typeof (value as { toNumber: () => number }).toNumber === "function"
    && typeof (value as { toString: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeDecimal);
  }
  if (typeof value === "object") {
    const plainObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      plainObj[k] = serializeDecimal(v);
    }
    return plainObj;
  }
  return value;
}

async function readFields(formData: FormData, fields: MasterFieldDefinition[]) {
  const entries = await Promise.all(fields.map(async (field) => {
    if (field.type === "image") {
      const file = formData.get(`field_${field.key}`);
      if (!(file instanceof File) || file.size === 0) return [field.key, null] as const;
      if (!file.type.startsWith("image/")) throw new Error(`${field.label} must be an image file.`);
      if (file.size > 2 * 1024 * 1024) throw new Error(`${field.label} must be 2 MB or smaller.`);
      const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
      return [field.key, `data:${file.type};base64,${bytes}`] as const;
    }
    if (field.multiple) return [field.key, formData.getAll(`field_${field.key}`).map((value) => String(value).trim()).filter(Boolean)];
    const value = formData.get(`field_${field.key}`);
    if (field.type === "checkbox") return [field.key, value === "on"];
    if (field.type === "number" || field.type === "percentage") return [field.key, value ? Number(value) : null];
    return [field.key, String(value ?? "").trim() || null];
  }));
  return Object.fromEntries(entries);
}

function readArticleSizePrices(formData: FormData) {
  const value = formData.get("articleSizePrices");
  if (typeof value !== "string" || !value) return [];
  try {
    return parseFinishedGoodsSizePrices(JSON.parse(value));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Article size prices are invalid. Refresh the form and try again.");
    }
    throw error;
  }
}

function getRecordLabel(fields: Record<string, unknown>, definition: { fields: MasterFieldDefinition[]; labelField?: string }) {
  const firstValue = fields[definition.labelField ?? definition.fields[0]?.key];
  return String(firstValue ?? "").trim();
}

function readChildValues(formData: FormData, field: MasterFieldDefinition) {
  if (field.multiple) return [...new Set(formData.getAll(`field_${field.key}`).map((value) => String(value).trim()).filter(Boolean))];
  const rawValue = String(formData.get(`field_${field.key}`) ?? "[]");
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed;
  } catch {
    throw new Error(`${field.label} data is invalid. Refresh the page and try again.`);
  }
}

function validateChildValues(
  childField: MasterFieldDefinition,
  formData: FormData,
) {
  const selectedValues = readChildValues(formData, childField);
  const childFields = childField.childFields ?? [];
  const slNumbers = new Set<number>();
  const hasSlNo = childFields.some((child) => child.key === "Sl_No");
  const processNames = new Set<string>();
  const validatedRows: Array<{ id?: string; label: string; fields: Record<string, unknown> }> = [];

  for (const rawValue of selectedValues) {
    const row = rawValue && typeof rawValue === "object" ? rawValue as Record<string, unknown> : {};
    const fields = Object.fromEntries(childFields.map((child) => {
      const value = row[child.key];
      if (child.type === "decimal") return [child.key, value === "" || value === null || value === undefined ? null : String(value).trim()];
      if (child.type === "number" || child.type === "percentage") return [child.key, value === "" || value === null || value === undefined ? null : Number(value)];
      return [child.key, value === null || value === undefined ? "" : String(value).trim()];
    }));
    if (!Object.values(fields).some((value) => value !== null && value !== undefined && String(value).trim() !== "")) continue;
    const missingRequired = childFields.some((child) => child.required && (fields[child.key] === null || fields[child.key] === undefined || String(fields[child.key]).trim() === ""));
    if (missingRequired) throw new Error(`${childField.label} has an incomplete row.`);
    const labelField = childFields.find((child) => child.type === "lookup") ?? childFields[0];
    const label = String(labelField ? fields[labelField.key] ?? "" : "").trim();
    if (!label) continue;
    const slNo = Number(fields.Sl_No);
    if (hasSlNo && (!Number.isInteger(slNo) || slNo <= 0)) throw new Error(`${childField.label} Sl No must be a positive whole number.`);
    if (hasSlNo && slNumbers.has(slNo)) throw new Error(`${childField.label} cannot contain duplicate Sl No values.`);
    if (processNames.has(label)) {
      throw new Error(childField.childModuleKey === "article-variant"
        ? "Each color can only be added once to a finished goods style."
        : `${childField.label} cannot contain the same process more than once.`);
    }
    if (hasSlNo) slNumbers.add(slNo);
    processNames.add(label);
    const id = typeof row.id === "string" ? row.id : undefined;
    validatedRows.push({ ...(id ? { id } : {}), label, fields });
  }

  return { childModuleKey: childField.childModuleKey ?? childField.lookupModuleKey, validatedRows };
}

async function saveChildValues(
  organizationId: string,
  parentId: string,
  definition: { key?: string; fields: MasterFieldDefinition[] },
  formData: FormData,
) {
  const childField = definition.fields.find((field) => (field.type === "child-list" && field.childModuleKey) || (field.type === "lookup" && field.multiple && field.lookupModuleKey));
  if (!childField) return;
  if (definition.key === "size-group") {
    await syncSizeGroupSizes(organizationId, parentId, readChildValues(formData, childField));
    return;
  }
  const { childModuleKey, validatedRows } = validateChildValues(childField, formData);
  if (!childModuleKey) return;

  const existingChildren = await getMasterValuesForOrganization(organizationId, childModuleKey, true);
  const existingForParent = existingChildren.filter((child) => child.parent_id === parentId);
  await Promise.all(existingForParent.map((child) => deleteMasterValue(organizationId, child.value_id)));

  for (const row of validatedRows) {
    await createMasterValueForOrganization(organizationId, childModuleKey, {
      label: row.label,
      fields: row.fields as Parameters<typeof createMasterValueForOrganization>[2]["fields"],
      parentValueId: parentId,
    });
  }
}

function masterDataErrorRedirect(
  workspaceId: string,
  organizationId: string,
  moduleKey: string,
  error: unknown,
  returnToArticleDetail = false,
  recordCode = "",
  returnToSizeGroupDetail = false,
  recordId = "",
  returnToMasterRecord = false,
  masterRecordCode = "",
): never {
  const message = error instanceof Error ? error.message : "Unable to save master data.";
  if (returnToMasterRecord && moduleKey !== "article" && moduleKey !== "size-group") {
    const recordPath = masterRecordCode
      ? `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}/${encodeURIComponent(masterRecordCode)}`
      : `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}/create`;
    const editMode = masterRecordCode ? "&mode=edit" : "";
    redirect(`${recordPath}?error=${encodeURIComponent(message)}${editMode}`);
  }
  if (returnToSizeGroupDetail && moduleKey === "size-group" && recordId) {
    const recordPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/size-group/${encodeURIComponent(recordId)}`;
    redirect(`${recordPath}?error=${encodeURIComponent(message)}&mode=edit`);
  }
  if (returnToArticleDetail && moduleKey === "article") {
    const articlePath = recordCode
      ? `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/${encodeURIComponent(recordCode)}`
      : `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/create`;
    const editMode = recordCode ? "&mode=edit" : "";
    redirect(`${articlePath}?error=${encodeURIComponent(message)}${editMode}`);
  }
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?error=${encodeURIComponent(message)}`);
}

function createWorkbookLookupResolver(organizationId: string) {
  const optionCache = new Map<string, Promise<MasterWorkbookLookupOption[]>>();
  const exactOptionCache = new Map<string, Promise<MasterWorkbookLookupOption[]>>();

  const getOptions = (moduleKey: string) => {
    const cached = optionCache.get(moduleKey);
    if (cached) return cached;
    const options = moduleKey === "article-size"
      ? getSizeGroupSizesForOrganization(organizationId).then((items) => items
          .filter((item) => item.size.is_active)
          .map((item) => ({
            id: item.size.id,
            value_id: item.size.value_id,
            label: item.size.label,
            parent_id: item.groupId,
          })))
      : getMasterValuesForOrganization(organizationId, moduleKey, false, { limit: 500 })
          .then((items) => items.map((item) => ({
            id: item.id,
            value_id: item.value_id,
            label: item.label,
            parent_id: item.parent_id,
          })));
    optionCache.set(moduleKey, options);
    return options;
  };

  return async (moduleKey: string, value: string) => {
    const search = String(value ?? "").trim().toLocaleLowerCase();
    if (!search) return [];
    const listed = (await getOptions(moduleKey)).filter((option) =>
      [option.id, option.value_id, option.label].some((candidate) =>
        candidate !== undefined && String(candidate).toLocaleLowerCase() === search,
      ),
    );
    if (listed.length) return listed;
    if (moduleKey === "article-size") return [];

    const cacheKey = `${moduleKey}\u0000${search}`;
    let exactSearch = exactOptionCache.get(cacheKey);
    if (!exactSearch) {
      exactSearch = getMasterValuesForOrganization(organizationId, moduleKey, false, {
        search: String(value),
        exactSearch: true,
        limit: 2,
      }).then((items) => items.map((item) => ({
        id: item.id,
        value_id: item.value_id,
        label: item.label,
        parent_id: item.parent_id,
      })));
      exactOptionCache.set(cacheKey, exactSearch);
    }
    return exactSearch;
  };
}

export async function createMasterValueAction(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const returnToArticleDetail = formData.get("returnToArticleDetail") === "true";
  const returnToMasterRecord = formData.get("returnToMasterRecord") === "true";
  const definition = getMasterDefinition(moduleKey);
  let fields: MasterFieldValues = {};
  try {
    fields = definition ? await readFields(formData, definition.fields) : {};
  } catch (error) {
    masterDataErrorRedirect(workspaceId, organizationId, moduleKey, error, returnToArticleDetail, "", false, "", returnToMasterRecord);
  }
  const label = definition ? getRecordLabel(fields, definition) : "";
  const code = String(formData.get("code") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!workspaceId || !organizationId || !moduleKey || !definition || definition.hidden) {
    return;
  }

  const missingRequiredFieldLabels = getMissingRequiredFieldLabels(
    fields,
    definition.fields,
    definition.labelField ?? definition.fields[0]?.key,
  );
  if (missingRequiredFieldLabels.length > 0) {
    const errorMessage = getRequiredFieldsErrorMessage(missingRequiredFieldLabels);
    if (returnToArticleDetail && moduleKey === "article") {
      masterDataErrorRedirect(workspaceId, organizationId, moduleKey, new Error(errorMessage), true);
    }
    if (returnToMasterRecord) {
      masterDataErrorRedirect(workspaceId, organizationId, moduleKey, new Error(errorMessage),
        false, "", false, "", true);
    }
    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?error=${encodeURIComponent(errorMessage)}`);
  }

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  let articleVariants: Array<{ id?: string; fields: Record<string, unknown> }> | undefined;
  try {
    if (moduleKey === "article") {
      const variantField = definition.fields.find((field) => field.type === "child-list");
      if (!variantField) throw new Error("Article variant fields are not configured.");
      articleVariants = validateChildValues(variantField, formData).validatedRows
        .map(({ id, fields: variantFields }) => ({ ...(id ? { id } : {}), fields: variantFields }));
    }
  } catch (error) {
    masterDataErrorRedirect(workspaceId, organizationId, moduleKey, error, returnToArticleDetail, "", false, "", returnToMasterRecord);
  }

  let created;
  try {
    created = await createMasterValueForOrganization(organization.id, moduleKey, {
      label,
      code: code || null,
      description: description || null,
      fields,
      actorUserId: user.id,
      ...(articleVariants ? { articleVariants } : {}),
      ...(moduleKey === "article" ? {
        articleSizes: Array.isArray(fields.Sizes) ? fields.Sizes.map(String) : [],
        articleSizePrices: readArticleSizePrices(formData),
      } : {}),
    });
  } catch (error) {
    masterDataErrorRedirect(workspaceId, organizationId, moduleKey, error, returnToArticleDetail, "", false, "", returnToMasterRecord);
  }

  if (moduleKey !== "article") {
    try {
      await saveChildValues(organization.id, created.id, definition, formData);
    } catch (error) {
      await deleteMasterValue(organization.id, created.id);
      masterDataErrorRedirect(workspaceId, organizationId, moduleKey, error, returnToArticleDetail, "", false, "", returnToMasterRecord);
    }
  }

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}`);
  if (returnToArticleDetail && moduleKey === "article") {
    const articles = await getMasterValuesForOrganization(organization.id, "article", true, {
      search: label,
      exactSearch: true,
      limit: 1,
    });
    const articleCode = articles[0]?.code;
    if (articleCode) {
      const articlePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/${encodeURIComponent(articleCode)}`;
      revalidatePath(articlePath);
      redirect(`${articlePath}?saved=create`);
    }
  }
  if (returnToMasterRecord) {
    const recordPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}/${encodeURIComponent(created.value_id)}`;
    revalidatePath(recordPath);
    redirect(`${recordPath}?saved=create`);
  }
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?saved=create`);
}

export async function updateMasterValueAction(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const valueId = String(formData.get("valueId") ?? "");
  const returnToArticleDetail = formData.get("returnToArticleDetail") === "true";
  const returnToMasterRecord = formData.get("returnToMasterRecord") === "true";
  const masterRecordCode = String(formData.get("masterRecordCode") ?? "");
  const returnToSizeGroupDetail = moduleKey === "size-group"
    && formData.get("returnToSizeGroupDetail") === "true";
  const returnRecordCode = String(formData.get("field_article_code") ?? "");
  const definition = getMasterDefinition(moduleKey);
  let fields: MasterFieldValues = {};
  try {
    fields = definition ? await readFields(formData, definition.fields) : {};
  } catch (error) {
    masterDataErrorRedirect(
      workspaceId,
      organizationId,
      moduleKey,
      error,
      returnToArticleDetail,
      returnRecordCode,
      returnToSizeGroupDetail,
      valueId,
      returnToMasterRecord,
      masterRecordCode,
    );
  }
  const label = definition ? getRecordLabel(fields, definition) : "";
  const code = String(formData.get("code") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!workspaceId || !organizationId || !moduleKey || !valueId || !definition || definition.hidden) {
    return;
  }
  const missingRequiredFieldLabels = getMissingRequiredFieldLabels(
    fields,
    definition.fields,
    definition.labelField ?? definition.fields[0]?.key,
  );
  if (missingRequiredFieldLabels.length > 0) {
    const errorMessage = getRequiredFieldsErrorMessage(missingRequiredFieldLabels);
    if (returnToArticleDetail && moduleKey === "article" && definition) {
      masterDataErrorRedirect(workspaceId, organizationId, moduleKey, new Error(errorMessage), true, returnRecordCode);
    }
    if (returnToSizeGroupDetail && definition) {
      masterDataErrorRedirect(workspaceId, organizationId, moduleKey, new Error(errorMessage),
        false, "", true, valueId);
    }
    if (returnToMasterRecord && definition) {
      masterDataErrorRedirect(workspaceId, organizationId, moduleKey, new Error(errorMessage),
        false, "", false, "", true, masterRecordCode);
    }
    masterDataErrorRedirect(workspaceId, organizationId, moduleKey, new Error(errorMessage));
  }

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const childField = definition.fields.find((field) => (field.type === "child-list" && field.childModuleKey) || (field.type === "lookup" && field.multiple && field.lookupModuleKey));
  let articleVariants: Array<{ id?: string; fields: Record<string, unknown> }> | undefined;
  try {
    if (childField) {
      const validated = validateChildValues(childField, formData);
      if (moduleKey === "article") {
        articleVariants = validated.validatedRows.map(({ id, fields: variantFields }) => ({ ...(id ? { id } : {}), fields: variantFields }));
      }
    }
  } catch (error) {
    masterDataErrorRedirect(
      workspaceId,
      organizationId,
      moduleKey,
      error,
      returnToArticleDetail,
      returnRecordCode,
      returnToSizeGroupDetail,
      valueId,
      returnToMasterRecord,
      masterRecordCode,
    );
  }

  let updated;
  try {
    updated = await updateMasterValue(organization.id, valueId, {
      label,
      code: code || null,
      description: description || null,
      fields,
      actorUserId: user.id,
      ...(articleVariants ? { articleVariants } : {}),
      ...(moduleKey === "article" ? {
        articleSizes: Array.isArray(fields.Sizes) ? fields.Sizes.map(String) : [],
        articleSizePrices: readArticleSizePrices(formData),
      } : {}),
    });
  } catch (error) {
    masterDataErrorRedirect(
      workspaceId,
      organizationId,
      moduleKey,
      error,
      returnToArticleDetail,
      returnRecordCode,
      returnToSizeGroupDetail,
      valueId,
      returnToMasterRecord,
      masterRecordCode,
    );
  }

  if (updated && moduleKey !== "article") {
    try {
      await saveChildValues(organization.id, updated.id, definition, formData);
    } catch (error) {
      masterDataErrorRedirect(
        workspaceId,
        organizationId,
        moduleKey,
        error,
        returnToArticleDetail,
        returnRecordCode,
        returnToSizeGroupDetail,
        valueId,
        returnToMasterRecord,
        masterRecordCode,
      );
    }
  }

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}`);
  if (returnToArticleDetail && moduleKey === "article" && returnRecordCode) {
    const articlePath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/${encodeURIComponent(returnRecordCode)}`;
    revalidatePath(articlePath);
    redirect(`${articlePath}?saved=update`);
  }
  if (returnToSizeGroupDetail && moduleKey === "size-group") {
    const recordPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/size-group/${encodeURIComponent(valueId)}`;
    revalidatePath(recordPath);
    redirect(`${recordPath}?saved=update`);
  }
  if (returnToMasterRecord) {
    const recordPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}/${encodeURIComponent(masterRecordCode || valueId)}`;
    revalidatePath(recordPath);
    redirect(`${recordPath}?saved=update`);
  }
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?saved=update`);
}

async function deleteMasterValueAction(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const valueId = String(formData.get("valueId") ?? "");

  if (!workspaceId || !organizationId || !moduleKey || !valueId) {
    return;
  }

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const definition = getMasterDefinition(moduleKey);
  if (!definition || definition.hidden) {
    notFound();
  }
  if (moduleKey === "price-list") {
    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?error=${encodeURIComponent("Price List records cannot be deleted.")}`);
  }

  const deletionResult = await deleteMasterValue(organization.id, valueId, user.id);
  if (deletionResult.error) {
    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?error=${encodeURIComponent(deletionResult.error)}`);
  }

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}`);
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?saved=delete`);
}

async function deleteSelectedMasterValuesAction(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const recordIds = formData.getAll("recordId").map(String);
  const returnPath = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/master-data/${encodeURIComponent(moduleKey)}`;
  const definition = getMasterDefinition(moduleKey);

  if (!workspaceId || !organizationId || !definition || definition.hidden
    || recordIds.length === 0 || recordIds.length > 1000) {
    redirect(`${returnPath}?error=${encodeURIComponent(`Select valid ${definition?.label ?? "master"} records and try again.`)}`);
  }

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  if (moduleKey === "price-list") {
    redirect(`${returnPath}?error=${encodeURIComponent("Price List records cannot be deleted.")}`);
  }

  const result = await deleteSelectedMasterValuesForOrganization(
    organization.id,
    user.id,
    moduleKey,
    recordIds,
  );
  if (result.error) {
    redirect(`${returnPath}?error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=bulk-delete&deletedCount=${result.deletedCount}`);
}

async function importMasterValuesAction(formData: FormData): Promise<MasterRecordsImportResult> {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const definition = getMasterDefinition(moduleKey);

  if (!workspaceId || !organizationId || !moduleKey || !definition || definition.hidden) {
    return { created: 0, failures: [], fatalError: "This master is not available for import." };
  }

  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  let rows: ParsedMasterWorkbookRow[];
  let parseFailures: MasterRecordsImportResult["failures"] = [];
  const correctedRowsValue = formData.get("correctedRows");
  if (typeof correctedRowsValue === "string") {
    if (correctedRowsValue.length > 5_000_000) {
      return { created: 0, failures: [], fatalError: "The corrected rows exceed the allowed size." };
    }
    try {
      const correctedRows: unknown = JSON.parse(correctedRowsValue);
      if (!Array.isArray(correctedRows) || correctedRows.length > 500) {
        throw new Error("Corrected workbook rows are invalid.");
      }
      rows = [];
      for (const correctedRow of correctedRows) {
        try {
          rows.push(...validateCorrectedMasterWorkbookRows([correctedRow], definition));
        } catch (error) {
          const rowNumber = typeof correctedRow === "object" && correctedRow !== null
            && "rowNumber" in correctedRow && Number.isInteger(correctedRow.rowNumber)
            ? Number(correctedRow.rowNumber)
            : 0;
          if (rowNumber < 2) throw error;
          parseFailures.push({
            rowNumber,
            message: error instanceof Error ? error.message : "This corrected row is invalid.",
            row: correctedRow as ParsedMasterWorkbookRow,
          });
        }
      }
    } catch (error) {
      return {
        created: 0,
        failures: [],
        fatalError: error instanceof Error ? error.message : "The corrected rows could not be validated.",
      };
    }
  } else {
    const file = formData.get("workbook");
    if (!(file instanceof File)) {
      return { created: 0, failures: [], fatalError: "Choose an Excel workbook to import." };
    }
    try {
      const parsedWorkbook = await parseMasterRecordsWorkbook(file, definition, true);
      rows = parsedWorkbook.rows;
      parseFailures = parsedWorkbook.failures;
    } catch (error) {
      return {
        created: 0,
        failures: [],
        fatalError: error instanceof Error ? error.message : "The Excel workbook could not be validated.",
      };
    }
  }
  if (moduleKey === "article") {
    if (parseFailures.length > 0) {
      return {
        created: 0,
        failures: [],
        fatalError: `${parseFailures[0].message} Correct the Article workbook and upload it again; related Article rows are grouped during import.`,
      };
    }
    try {
      rows = groupArticleMatrixRows(rows);
    } catch (error) {
      return {
        created: 0,
        failures: [],
        fatalError: error instanceof Error ? error.message : "Article rows could not be grouped safely.",
      };
    }
  }
  const sourceRows = new Map([
    ...rows.map((row) => [row.rowNumber, structuredClone(row)] as const),
    ...parseFailures.flatMap((failure) => failure.row ? [[failure.rowNumber, structuredClone(failure.row)] as const] : []),
  ]);
  const failures: MasterRecordsImportResult["failures"] = [...parseFailures];
  const lookupValidRows: ParsedMasterWorkbookRow[] = [];
  const workbookLookupResolver = createWorkbookLookupResolver(organization.id);
  const articleValidationBatchSize = 250;
  for (let start = 0; start < rows.length; start += articleValidationBatchSize) {
    const validationBatch = rows.slice(start, start + articleValidationBatchSize);
    const articleSupportingIndex = moduleKey === "article"
      ? await loadArticleImportSupportingMasterIndex(
          organization.id,
          validationBatch.map((row) => ({ fields: row.fields, childRows: row.childRows })),
        )
      : undefined;
    for (const row of validationBatch) {
      const validationMessages: string[] = [];
      try {
        await validateMasterWorkbookLookupValues(
          definition,
          [row],
          workbookLookupResolver,
        );
      } catch (error) {
        validationMessages.push(error instanceof Error
          ? error.message
          : "Unable to validate this row's lookup values.");
      }
      if (moduleKey === "article") {
        const dependencies = await validateArticleImportSupportingMasters(
          prisma,
          organization.id,
          row.fields,
          Object.fromEntries(Object.entries(row.childRows).map(([key, value]) => [
            key,
            Array.isArray(value) ? value : [],
          ])),
          articleSupportingIndex,
        );
        validationMessages.push(...dependencies.errors.map((error) => error.message));
      }
      if (validationMessages.length > 0) {
        failures.push({
          rowNumber: row.rowNumber,
          message: [...new Set(validationMessages)].join(" "),
          row: sourceRows.get(row.rowNumber),
        });
      } else {
        lookupValidRows.push(row);
      }
    }
  }
  rows = lookupValidRows;

  if (formData.get("validateOnly") === "true") {
    return {
      created: 0,
      failures,
      validatedRowNumbers: rows.map((row) => row.rowNumber),
    };
  }

  let createdCount = 0;
  for (const row of rows) {
    let created: Awaited<ReturnType<typeof createMasterValueForOrganization>> | null = null;
    try {
      const fields = Object.fromEntries(Object.entries(row.fields).filter(([key]) =>
        definition.fields.find((field) => field.key === key)?.type !== "child-list",
      ));
      const missingRequiredFieldLabels = getMissingRequiredFieldLabels(
        fields,
        definition.fields,
        definition.labelField ?? definition.fields[0]?.key,
      );
      if (missingRequiredFieldLabels.length > 0) {
        throw new Error(getRequiredFieldsErrorMessage(missingRequiredFieldLabels));
      }

      if (moduleKey === "article") {
        const articleChildRows = Object.fromEntries(Object.entries(row.childRows).map(([key, value]) => [
          key,
          Array.isArray(value) ? value : [],
        ]));
        created = await prisma.$transaction(async (transaction) => {
          const dependencies = await validateArticleImportSupportingMasters(
            transaction,
            organization.id,
            fields,
            articleChildRows,
          );
          if (dependencies.errors.length > 0) {
            throw new Error(dependencies.errors[0].message);
          }
          const preparedFields = fields;
          const articleVariants = Array.isArray(articleChildRows.variants)
            ? articleChildRows.variants.filter((variant): variant is Record<string, unknown> =>
                typeof variant === "object" && variant !== null && !Array.isArray(variant))
                .map((variant) => ({ fields: variant }))
            : [];
          const label = getRecordLabel(preparedFields, definition);
          if (!label) throw new Error("The required Article name is missing.");
          return createMasterValueForOrganization(organization.id, moduleKey, {
            label,
            code: row.code,
            description: row.description,
            fields: preparedFields as MasterFieldValues,
            createOnly: true,
            articleVariants,
            articleSizes: Array.isArray(preparedFields.Sizes) ? preparedFields.Sizes.map(String) : [],
            articleSizePrices: parseFinishedGoodsSizePrices(preparedFields.Size_Prices ?? []),
          }, transaction);
        }, { maxWait: 10_000, timeout: 30_000 });
        createdCount += 1;
        continue;
      }

      const childFormData = new FormData();
      for (const field of definition.fields) {
        if (field.type === "child-list") {
          childFormData.set(`field_${field.key}`, JSON.stringify(row.childRows[field.key] ?? []));
          continue;
        }
        const value = fields[field.key];
        if (field.multiple && Array.isArray(value)) {
          value.forEach((item) => childFormData.append(`field_${field.key}`, String(item)));
        } else if (field.type === "checkbox") {
          childFormData.set(`field_${field.key}`, value === true ? "on" : "");
        } else {
          childFormData.set(`field_${field.key}`, value === null || value === undefined ? "" : String(value));
        }
      }

      const label = getRecordLabel(fields, definition);
      if (!label) throw new Error("The required record name is missing.");
      created = await createMasterValueForOrganization(organization.id, moduleKey, {
        label,
        code: row.code,
        description: row.description,
        fields: fields as MasterFieldValues,
        createOnly: true,
      });

      if (moduleKey !== "article") {
        await saveChildValues(organization.id, created.id, definition, childFormData);
      }
      createdCount += 1;
    } catch (error) {
      let message = error instanceof Error ? error.message : "Unable to create this record.";
      if (created) {
        try {
          const cleanup = await deleteMasterValue(organization.id, created.value_id);
          if (cleanup.error) {
            message = `${message} The parent record may remain because cleanup was blocked: ${cleanup.error}`;
          }
        } catch (cleanupError) {
          const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error.";
          message = `${message} The parent record may remain because cleanup failed: ${cleanupMessage}`;
        }
      }
      failures.push({ rowNumber: row.rowNumber, message, row: sourceRows.get(row.rowNumber) });
    }
  }

  if (createdCount > 0) {
    revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}`);
  }
  return { created: createdCount, failures };
}

export default async function MasterDataEditorPage({
  params,
  searchParams,
  formMode,
  recordCode,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string }>;
  searchParams: Promise<{ error?: string; saved?: string; deletedCount?: string }>;
  formMode?: "create" | "edit" | "view";
  recordCode?: string;
}) {
  const { workspaceId, organizationId, moduleKey } = await params;
  const { error, saved, deletedCount } = await searchParams;
  const parsedDeletedCount = Number(deletedCount);
  const hasValidBulkDeleteCount = Number.isSafeInteger(parsedDeletedCount) && parsedDeletedCount > 0;
  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const definition = getMasterDefinition(moduleKey) ?? MASTER_DEFINITIONS.find((candidate) => candidate.key === moduleKey);

  if (!definition || definition.hidden) {
    notFound();
  }

  if (moduleKey === "price-list" && recordCode === "SETTINGS") {
    return <PriceListSettingsPage workspaceId={workspaceId} organizationId={organizationId} />;
  }

  const childModuleKey = definition.fields.find((field) => field.type === "child-list")?.childModuleKey
    ?? definition.fields.find((field) => field.type === "lookup" && field.multiple)?.lookupModuleKey;
  const activeDummyDataBatch = formMode === "create"
    ? null
    : getActiveOrganizationDummyDataBatch(organization.id);
  const values = (formMode === "edit" || formMode === "view") && recordCode
    ? await getMasterValuesForOrganization(organization.id, moduleKey, true, {
        includeDummyData: true,
        activeDummyDataBatch,
        search: recordCode,
        exactSearch: true,
        limit: 2,
      }).then((items) => {
        const matches = items.filter((item) => item.value_id === recordCode
          || item.id === recordCode
          || (moduleKey === "price-list" && item.code?.toLocaleLowerCase() === recordCode.toLocaleLowerCase()));
        if (matches.length !== 1) notFound();
        return matches;
      })
    : formMode
      ? []
      : await getMasterValuesForOrganization(organization.id, moduleKey, true, { includeDummyData: true, activeDummyDataBatch });
  if (moduleKey === "price-list" && formMode === "view" && values[0]) {
    return (
      <PriceListContactReport
        workspaceId={workspaceId}
        organizationId={organizationId}
        priceListId={values[0].id}
      />
    );
  }
  if (moduleKey === "price-list" && !formMode) {
    const priceListTypeOptions = definition.fields.find((field) => field.key === "Channel_Type")?.options ?? [];
    return (
      <PriceListTypesHome
        workspaceId={workspaceId}
        organizationId={organizationId}
        priceListTypes={priceListTypeOptions}
        records={values.map((item) => ({
          id: item.id,
          label: item.label,
          priceListType: typeof item.fields.Channel_Type === "string" ? item.fields.Channel_Type : null,
        }))}
      />
    );
  }
  const shouldShowMasterHeader = !formMode && moduleKey !== "article";
  const formRecord = formMode === "edit" || formMode === "view" ? values[0] : undefined;
  const childRecords = formRecord && childModuleKey
    ? (await getMasterValuesForOrganization(organization.id, childModuleKey, true, {
        includeDummyData: true,
        activeDummyDataBatch,
        parentId: formRecord.id,
      })).map((item) => ({
        id: item.id,
        parentId: item.parent_id,
        label: item.label,
        fields: serializeDecimal(item.fields) as Record<string, unknown>,
      }))
    : [];

  return (
    <div>
      {shouldShowMasterHeader ? (
        <div>
          <div>
            <p>Master</p>
            <h3>{definition.label}</h3>
            <p>{definition.description}</p>
          </div>

        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {error}
        </p>
      ) : null}

      {saved && (saved !== "bulk-delete" || hasValidBulkDeleteCount) ? (
        <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {saved === "create"
            ? `${definition.label} created successfully.`
            : saved === "update"
              ? `${definition.label} updated successfully.`
              : saved === "bulk-delete"
                ? `${String(parsedDeletedCount)} ${definition.label} record${parsedDeletedCount === 1 ? "" : "s"} deleted successfully.`
                : `${definition.label} deleted successfully.`}
        </p>
      ) : null}

      <MasterRecordsTable
        records={values.map((item) => ({
          id: item.id,
          value_id: item.value_id,
          label: item.label,
          code: item.code,
          description: item.description,
          is_active: item.is_active,
          metadata: { fields: serializeDecimal(item.fields) as Record<string, unknown> },
        }))}
        fields={definition.fields}
        lookupOptions={{}}
        childRecords={childRecords}
        moduleLabel={definition.label}
        workspaceId={workspaceId}
        organizationId={organizationId}
        moduleKey={moduleKey}
        createAction={createMasterValueAction}
        updateAction={updateMasterValueAction}
        deleteAction={deleteMasterValueAction}
        deleteSelectedAction={deleteSelectedMasterValuesAction}
        importAction={importMasterValuesAction}
        formMode={formMode}
        initialRecord={formRecord ? {
          id: formRecord.id,
          value_id: formRecord.value_id,
          label: formRecord.label,
          code: formRecord.code,
          description: formRecord.description,
          is_active: formRecord.is_active,
          metadata: { fields: serializeDecimal(formRecord.fields) as Record<string, unknown> },
        } : undefined}
        formError={formMode ? error : undefined}
        saved={formMode ? saved : undefined}
      />
    </div>
  );
}
