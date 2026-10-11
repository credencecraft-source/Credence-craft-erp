import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getMasterValuesForOrganization, isMasterSectionBulkDeletable } from "@/lib/master-data/master-data-constants";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { createOrganizationMasterSetupSection, createOrganizationMasterSetupStage, createOrganizationMerchandisingStarterMasters, deleteOrganizationMasterSetupSection, type OrganizationMasterSetupRecord } from "@/lib/services/master-data/organization-master-setup-service";
import { getOrganizationMasterSetupDefinitions, getOrganizationMasterSetupFields, type OrganizationMasterSetupStage } from "@/lib/master-data/organization-master-setup-stages";
import OrganizationMasterSetupForm from "./organization-master-setup-form";

export type OrganizationMasterSetupMode = "direct" | "excel";
export type OrganizationMasterSetupPageProps = {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; step?: string; starterError?: string; starterCreated?: string; deleted?: string; section?: string }>;
  mode: OrganizationMasterSetupMode;
};

function getSetupPagePath(workspaceId: string, organizationId: string, mode: OrganizationMasterSetupMode) {
  return `/dashboard/${workspaceId}/organizations/${organizationId}/admin/migration/${mode}`;
}

function isSetupRecord(value: unknown): value is OrganizationMasterSetupRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.moduleKey !== "string" ||
    typeof record.label !== "string" ||
    record.label.length > 500 ||
    typeof record.fields !== "object" ||
    record.fields === null ||
    Array.isArray(record.fields)
  ) {
    return false;
  }
  return Object.values(record.fields).every((fieldValue) => (
    fieldValue === null ||
    typeof fieldValue === "boolean" ||
    (typeof fieldValue === "string" && fieldValue.length <= 5000) ||
    (typeof fieldValue === "number" && Number.isFinite(fieldValue)) ||
    (Array.isArray(fieldValue) && fieldValue.length <= 500 && fieldValue.every((item) => typeof item === "string" && item.length <= 500))
  ));
}

async function submitOrganizationMasterSetup(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const mode = formData.get("migrationMode") === "excel" ? "excel" : "direct";
  const pagePath = getSetupPagePath(workspaceId, organizationId, mode);
  let input: { stage: OrganizationMasterSetupStage; records: OrganizationMasterSetupRecord[] };
  const serializedSetup = String(formData.get("setup") ?? "");
  if (serializedSetup.length > 5_000_000) {
    redirect(`${pagePath}?error=${encodeURIComponent("The workbook contains too much data. Split it into smaller uploads.")}`);
  }
  try { input = JSON.parse(serializedSetup) as typeof input; } catch { redirect(`${pagePath}?error=Invalid%20setup%20data`); }
  if (
    !input ||
    !["independent", "related", "third"].includes(input.stage) ||
    !Array.isArray(input.records) ||
    input.records.length > 2000 ||
    !input.records.every(isSetupRecord)
  ) {
    redirect(`${pagePath}?error=Invalid%20setup%20data`);
  }
  const setupModule = String(formData.get("setupModule") ?? "").trim();
  const isWorkbookUpload = formData.get("workbookUpload") === "1";
  const allowedKeys = new Set(getOrganizationMasterSetupDefinitions(input.stage).map((definition) => definition.key));
  if (setupModule) {
    if (!allowedKeys.has(setupModule)) {
      redirect(`${pagePath}?step=${input.stage}&error=${encodeURIComponent("This master section does not belong to the selected step.")}`);
    }
    input.records = input.records.filter((record) => record.moduleKey === setupModule);
    if (input.records.length === 0) {
      redirect(`${pagePath}?step=${input.stage}&error=${encodeURIComponent("Enter at least one value for this master.")}`);
    }
  } else if (!isWorkbookUpload) {
    redirect(`${pagePath}?step=${input.stage}&error=${encodeURIComponent("Save values using their section button, or upload a completed workbook.")}`);
  }
  if (input.records.some((record) => !record || !allowedKeys.has(record.moduleKey))) {
    redirect(`${pagePath}?step=${input.stage}&error=${encodeURIComponent("The workbook contains a master that does not belong to this step.")}`);
  }
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
  try {
    if (setupModule) {
      await createOrganizationMasterSetupSection(organization.id, input.records, setupModule);
    } else {
      await createOrganizationMasterSetupStage(organization.id, input.records);
    }
  } catch (error) {
    redirect(`${pagePath}?step=${input.stage}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create master records.")}`);
  }
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data`);
  revalidatePath(pagePath);
  redirect(`${pagePath}?step=${input.stage}&saved=1`);
}

async function createMerchandisingStarterMastersAction(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const mode = formData.get("migrationMode") === "excel" ? "excel" : "direct";
  const pagePath = getSetupPagePath(workspaceId, organizationId, mode);
  if (!workspaceId || !organizationId) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

  let result;
  try {
    result = await createOrganizationMerchandisingStarterMasters(organization.id);
  } catch (error) {
    redirect(`${pagePath}?starterError=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create starter masters.")}`);
  }

  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data`);
  revalidatePath(pagePath);
  redirect(`${pagePath}?starterCreated=${result.createdCount}`);
}

async function deleteOrganizationMasterSetupSectionAction(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const stage = String(formData.get("step") ?? "");
  const mode = formData.get("migrationMode") === "excel" ? "excel" : "direct";
  const pagePath = getSetupPagePath(workspaceId, organizationId, mode);
  if (!["independent", "related", "third"].includes(stage)) {
    redirect(`${pagePath}?error=${encodeURIComponent("Invalid setup step.")}`);
  }
  const definition = getOrganizationMasterSetupDefinitions(stage as OrganizationMasterSetupStage)
    .find((master) => master.key === moduleKey);
  if (!definition) {
    redirect(`${pagePath}?step=${stage}&error=${encodeURIComponent("This master section does not belong to the selected step.")}`);
  }
  if (String(formData.get("confirmation") ?? "") !== `DELETE ${definition.label.toLocaleUpperCase()}`) {
    redirect(`${pagePath}?step=${stage}&error=${encodeURIComponent("The deletion confirmation did not match.")}`);
  }

  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

  try {
    const result = await deleteOrganizationMasterSetupSection(organization.id, user.id, moduleKey);
    revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data`);
    revalidatePath(pagePath);
    redirect(`${pagePath}?step=${stage}&deleted=${result.deletedCount}&section=${encodeURIComponent(moduleKey)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${pagePath}?step=${stage}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete this master section.")}`);
  }
}

export default async function OrganizationMasterSetupPage({ params, searchParams, mode }: OrganizationMasterSetupPageProps) {
  const { workspaceId, organizationId } = await params;
  const { error, saved, step, starterError, starterCreated, deleted, section } = await searchParams;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
  const activeStage = step === "related" || step === "third" ? step : "independent";
  const activeDefinitions = getOrganizationMasterSetupDefinitions(activeStage);
  const existing = Object.fromEntries(await Promise.all(activeDefinitions.map(async (definition) => [definition.key, (await getMasterValuesForOrganization(organization.id, definition.key, true)).map((value) => value.label)])));
  const lookupKeys = [...new Set(activeDefinitions.flatMap((definition) => [
    ...definition.fields.flatMap((field) => field.lookupModuleKey ? [field.lookupModuleKey] : []),
    ...(definition.key === "process-template" ? ["process-master"] : []),
  ]))];
  const lookupOptions = Object.fromEntries(await Promise.all(lookupKeys.map(async (key) => [key, (await getMasterValuesForOrganization(organization.id, key, false)).map((value) => ({ id: value.id, label: value.label }))])));
  const stage = {
    definitions: activeDefinitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      labelField: definition.labelField,
      canDelete: isMasterSectionBulkDeletable(definition.key),
      fields: getOrganizationMasterSetupFields(definition),
    })),
    existing,
    lookupOptions,
  };
  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <Badge>Master Level</Badge>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            {mode === "excel" ? "Organization Master Setup via Excel" : "Organization Master Setup"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            {mode === "excel"
              ? "Complete the three stages using downloadable Excel templates, then upload each completed workbook."
              : "Create organization masters directly in three stages. Starter values are editable and are only created when you submit their master section."}
          </p>
        </div>
        {error ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{error}</p> : null}
        {saved === "1" ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">Master records saved successfully.</p> : null}
        {deleted !== undefined && /^\d+$/.test(deleted) ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {Number(deleted) === 0
              ? "This master section had no values to delete."
              : `Deleted ${deleted} value${deleted === "1" ? "" : "s"} from ${activeDefinitions.find((definition) => definition.key === section)?.label ?? "the master section"}.`}
          </p>
        ) : null}
        {starterError ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{starterError}</p> : null}
        {starterCreated !== undefined && /^\d+$/.test(starterCreated) ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {Number(starterCreated) === 0
              ? "All requested masters already exist."
              : `Added ${starterCreated} starter records and size relationships. Existing matching values were reused.`}
          </p>
        ) : null}
        {mode === "direct" ? (
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Merchandising starter masters</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                Creates the requested brands, buyers, sizes, Louis Philippe size groups, Finished Goods categories, and Full Sleeve subcategory. Matching active values are reused; demo data remains separate.
              </p>
            </div>
            <form action={createMerchandisingStarterMastersAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="migrationMode" value={mode} />
              <Button type="submit" className="shrink-0">Create Requested Masters</Button>
            </form>
          </div>
        ) : null}
        <OrganizationMasterSetupForm action={submitOrganizationMasterSetup} deleteSectionAction={deleteOrganizationMasterSetupSectionAction} workspaceId={workspaceId} organizationId={organizationId} stage={stage} activeStage={activeStage} mode={mode} />
      </Section>
    </Page>
  );
}