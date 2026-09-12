import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MasterRecordsTable } from "@/components/master-data/master-records-data-table";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import {
  MASTER_DEFINITIONS,
  createMasterValueForOrganization,
  deleteMasterValue,
  getMasterDefinition,
  getMasterValuesForOrganization,
  updateMasterValue,
} from "@/lib/master-data/master-data-constants";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-definitions";

function serializeDecimal(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
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

function readFields(formData: FormData, fields: MasterFieldDefinition[]) {
  return Object.fromEntries(fields.map((field) => {
    if (field.multiple) return [field.key, formData.getAll(`field_${field.key}`).map((value) => String(value).trim()).filter(Boolean)];
    const value = formData.get(`field_${field.key}`);
    if (field.type === "checkbox") return [field.key, value === "on"];
    if (field.type === "number" || field.type === "percentage") return [field.key, value ? Number(value) : null];
    return [field.key, String(value ?? "").trim() || null];
  }));
}

function getRecordLabel(fields: Record<string, string | number | boolean | null>, definition: { fields: MasterFieldDefinition[]; labelField?: string }) {
  const firstValue = fields[definition.labelField ?? definition.fields[0]?.key];
  return String(firstValue ?? "").trim();
}

function readChildValues(formData: FormData, field: MasterFieldDefinition) {
  if (field.multiple) return [...new Set(formData.getAll(`field_${field.key}`).map((value) => String(value).trim()).filter(Boolean))];
  const rawValue = String(formData.get(`field_${field.key}`) ?? "[]");
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? [...new Set(parsed.map((value) => String(value).trim()).filter(Boolean))]
      : [];
  } catch {
    return [];
  }
}

function hasMissingRequiredField(fields: Record<string, unknown>, definition: { fields: MasterFieldDefinition[] }) {
  return definition.fields.some((field) => {
    if (!field.required) return false;
    const value = fields[field.key];
    return Array.isArray(value) ? value.length === 0 : value === null || value === undefined || value === "";
  });
}

async function saveChildValues(
  organizationId: string,
  parentValueId: string,
  definition: { fields: MasterFieldDefinition[] },
  formData: FormData,
) {
  const childField = definition.fields.find((field) => (field.type === "child-list" && field.childModuleKey) || (field.type === "lookup" && field.multiple && field.lookupModuleKey));
  const childModuleKey = childField?.childModuleKey ?? childField?.lookupModuleKey;
  if (!childField || !childModuleKey) return;

  const selectedValues = readChildValues(formData, childField);
  const existingChildren = await getMasterValuesForOrganization(organizationId, childModuleKey, true);
  const selectedSet = new Set(selectedValues);

  await Promise.all(
    existingChildren
      .filter((child) => child.parent_id === parentValueId && !selectedSet.has(child.label))
      .map((child) => deleteMasterValue(organizationId, child.value_id)),
  );

  await Promise.all(selectedValues.map((value) => createMasterValueForOrganization(organizationId, childModuleKey, {
    label: value,
    fields: { Size: value },
    parentValueId,
  })));
}

async function createMasterValueAction(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const definition = getMasterDefinition(moduleKey);
  const fields = definition ? readFields(formData, definition.fields) : {};
  const label = definition ? getRecordLabel(fields, definition) : "";
  const code = String(formData.get("code") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!workspaceId || !organizationId || !moduleKey || !definition) {
    return;
  }

  if (!label || hasMissingRequiredField(fields, definition)) {
    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?error=${encodeURIComponent(`Complete all required ${definition.label.toLowerCase()} fields before saving.`)}`);
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
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

  const created = await createMasterValueForOrganization(organization.id, moduleKey, {
    label,
    code: code || null,
    description: description || null,
    fields,
  });

  await saveChildValues(organization.id, created.value_id, definition, formData);

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}`);
}

async function updateMasterValueAction(formData: FormData) {
  "use server";

  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const valueId = String(formData.get("valueId") ?? "");
  const definition = getMasterDefinition(moduleKey);
  const fields = definition ? readFields(formData, definition.fields) : {};
  const label = definition ? getRecordLabel(fields, definition) : "";
  const code = String(formData.get("code") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!workspaceId || !organizationId || !moduleKey || !valueId || !label || !definition || hasMissingRequiredField(fields, definition)) {
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
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

  const updated = await updateMasterValue(organization.id, valueId, {
    label,
    code: code || null,
    description: description || null,
    fields,
  });

  if (updated) {
    await saveChildValues(organization.id, updated.value_id, definition, formData);
  }

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}`);
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
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

  if (!getMasterDefinition(moduleKey)) {
    notFound();
  }

  const deletionResult = await deleteMasterValue(organization.id, valueId);
  if (deletionResult.error) {
    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}?error=${encodeURIComponent(deletionResult.error)}`);
  }

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/${moduleKey}`);
}

export default async function MasterDataEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { workspaceId, organizationId, moduleKey } = await params;
  const { error } = await searchParams;
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

  const definition = getMasterDefinition(moduleKey) ?? MASTER_DEFINITIONS.find((candidate) => candidate.key === moduleKey);

  if (!definition) {
    notFound();
  }

  const values = await getMasterValuesForOrganization(organization.id, moduleKey, true);
  const lookupKeys = [...new Set(definition.fields.flatMap((field) => field.lookupModuleKey ? [field.lookupModuleKey] : []))];
  const lookupOptions = Object.fromEntries(await Promise.all(lookupKeys.map(async (lookupKey) => [lookupKey, (await getMasterValuesForOrganization(organization.id, lookupKey, true)).map((item) => ({ id: item.id, value_id: item.value_id, label: item.label, parent_id: item.parent_id }))])));
  const childModuleKey = definition.fields.find((field) => field.type === "child-list")?.childModuleKey
    ?? definition.fields.find((field) => field.type === "lookup" && field.multiple)?.lookupModuleKey;
  const childRecords = childModuleKey
    ? (await getMasterValuesForOrganization(organization.id, childModuleKey, true)).map((item) => ({ parentId: item.parent_id, label: item.label }))
    : [];

  return (
    <div>
      <div>
        <div>
          <p>Master</p>
          <h3>{definition.label}</h3>
          <p>{definition.description}</p>
        </div>

        <div>
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data`}
          >
            Back to masters
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {error}
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
        lookupOptions={lookupOptions}
        childRecords={childRecords}
        moduleLabel={definition.label}
        workspaceId={workspaceId}
        organizationId={organizationId}
        moduleKey={moduleKey}
        createAction={createMasterValueAction}
        updateAction={updateMasterValueAction}
        deleteAction={deleteMasterValueAction}
      />
    </div>
  );
}