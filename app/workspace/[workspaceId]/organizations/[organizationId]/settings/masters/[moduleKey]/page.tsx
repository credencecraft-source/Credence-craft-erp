import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MasterModuleShell } from "@/components/master-module-shell";
import { MasterRecordsTable } from "@/components/master-records-table";
import { requireSessionUser } from "@/lib/auth-session";
import { getOrganizationForUser } from "@/lib/organizations/service";
import {
  MASTER_DEFINITIONS,
  createMasterValueForOrganization,
  deleteMasterValue,
  getMasterDefinition,
  getMasterValuesForOrganization,
  updateMasterValue,
} from "@/lib/master-data";
import type { MasterFieldDefinition } from "@/lib/master-definitions";

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

  revalidatePath(`/workspace/${workspaceId}/organizations/${organizationId}/settings/masters/${moduleKey}`);
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

  revalidatePath(`/workspace/${workspaceId}/organizations/${organizationId}/settings/masters/${moduleKey}`);
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

  revalidatePath(`/workspace/${workspaceId}/organizations/${organizationId}/settings/masters/${moduleKey}`);
}

export default async function MasterModuleDetailPage({
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
    <MasterModuleShell
      workspaceId={workspaceId}
      organizationId={organizationId}
      organizationName={organization.organization_name}
      value="settings"
      moduleLabel="Settings"
      title="Master module"
      description="Maintain the reusable lookup values used throughout the ERP order and production flow."
      subItems={[]}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Master</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">{definition.label}</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{definition.description}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/workspace/${workspaceId}/organizations/${organizationId}/settings/masters`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
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
            metadata: { fields: item.fields },
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
    </MasterModuleShell>
  );
}
