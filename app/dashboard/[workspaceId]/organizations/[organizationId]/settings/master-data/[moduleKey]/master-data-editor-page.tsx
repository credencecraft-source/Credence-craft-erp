import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MasterRecordsTable } from "@/components/master-data/master-records-data-table";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
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
  if (!workspaceId || !organizationId || !moduleKey || !label) {
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

  const moduleDefinition = definition;

  if (!moduleDefinition) {
    notFound();
  }

  await createMasterValueForOrganization(organization.id, moduleKey, {
    label,
    code: code || null,
    description: description || null,
    fields,
  });

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/${moduleKey}`);
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
  if (!workspaceId || !organizationId || !moduleKey || !valueId || !label) {
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

  if (!definition) {
    notFound();
  }

  await updateMasterValue(organization.id, valueId, {
    label,
    code: code || null,
    description: description || null,
    fields,
  });

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/${moduleKey}`);
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

  if (!getMasterDefinition(moduleKey)) {
    notFound();
  }

  await deleteMasterValue(organization.id, valueId);

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/${moduleKey}`);
}

export default async function MasterDataEditorPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string }>;
}) {
  const { workspaceId, organizationId, moduleKey } = await params;
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
  const lookupOptions = Object.fromEntries(await Promise.all(lookupKeys.map(async (lookupKey) => [lookupKey, (await getMasterValuesForOrganization(organization.id, lookupKey)).map((item) => ({ id: item.value_id, label: item.label }))])));

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