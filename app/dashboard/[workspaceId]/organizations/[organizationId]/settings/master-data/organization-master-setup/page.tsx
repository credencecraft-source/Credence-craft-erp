import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { createOrganizationMasterSetupStage, createOrganizationMerchandisingStarterMasters, ORGANIZATION_MASTER_SETUP_EXCLUDED_KEYS, type OrganizationMasterSetupRecord } from "@/lib/services/master-data/organization-master-setup-service";
import OrganizationMasterSetupForm from "./organization-master-setup-form";

const BULK_SETUP_MODULE_KEYS = new Set([
  "color",
  "currency-type",
  "merchandiser",
  "pre-order-checklist",
  "process-master",
  "raw-material-type",
  "size",
]);

async function submitOrganizationMasterSetup(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  let input: { stage: "independent" | "related" | "third"; records: OrganizationMasterSetupRecord[] };
  try { input = JSON.parse(String(formData.get("setup") ?? "")) as typeof input; } catch { redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup?error=Invalid%20setup%20data`); }
  const setupModule = String(formData.get("setupModule") ?? "").trim();
  if (setupModule) {
    input.records = input.records.filter((record) => record.moduleKey === setupModule);
    if (input.records.length === 0) {
      redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup?step=${input.stage}&error=${encodeURIComponent("Enter at least one value for this master.")}`);
    }
  } else {
    input.records = input.records.filter((record) => !BULK_SETUP_MODULE_KEYS.has(record.moduleKey));
  }
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
  try { await createOrganizationMasterSetupStage(organization.id, input.records); } catch (error) { redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup?step=${input.stage}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create master records.")}`); }
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data`);
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup?step=${input.stage}&saved=1`);
}

async function createMerchandisingStarterMastersAction(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!workspaceId || !organizationId) notFound();

  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

  const pagePath = `/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/organization-master-setup`;
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

export default async function OrganizationMasterSetupPage({ params, searchParams }: { params: Promise<{ workspaceId: string; organizationId: string }>; searchParams: Promise<{ error?: string; saved?: string; step?: string; starterError?: string; starterCreated?: string }> }) {
  const { workspaceId, organizationId } = await params;
  const { error, saved, step, starterError, starterCreated } = await searchParams;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
  const definitions = MASTER_DEFINITIONS.filter((definition) => !definition.hidden && definition.fields.length > 0 && !ORGANIZATION_MASTER_SETUP_EXCLUDED_KEYS.has(definition.key));
  const thirdStageKeys = new Set(["operation", "raw-material-sub-category", "size-group", "sub-category"]);
  const independentDefinitions = definitions.filter((definition) => !definition.fields.some((field) => field.type === "lookup" || field.type === "child-list") && !thirdStageKeys.has(definition.key));
  const relatedDefinitions = definitions.filter((definition) => !independentDefinitions.includes(definition) && !thirdStageKeys.has(definition.key));
  const thirdDefinitions = definitions.filter((definition) => thirdStageKeys.has(definition.key));
  const activeStage = step === "related" || step === "third" ? step : "independent";
  const activeDefinitions = activeStage === "related" ? relatedDefinitions : activeStage === "third" ? thirdDefinitions : independentDefinitions;
  const existing = Object.fromEntries(await Promise.all(activeDefinitions.map(async (definition) => [definition.key, (await getMasterValuesForOrganization(organization.id, definition.key, true)).map((value) => value.label)])));
  const lookupKeys = [...new Set(activeDefinitions.flatMap((definition) => [
    ...definition.fields.flatMap((field) => field.lookupModuleKey ? [field.lookupModuleKey] : []),
    ...(definition.key === "process-template" ? ["process-master"] : []),
  ]))];
  const lookupOptions = Object.fromEntries(await Promise.all(lookupKeys.map(async (key) => [key, (await getMasterValuesForOrganization(organization.id, key, true)).map((value) => ({ id: value.id, label: value.label }))])));
  const stage = { definitions: activeDefinitions.map((definition) => ({ key: definition.key, label: definition.label, labelField: definition.labelField, fields: definition.fields.flatMap((field) => {
    if (definition.key === "category" && ["Create_Cost_Center", "Maximum_Excess_Allowed"].includes(field.key)) return [];
    if (definition.key === "process-template" && field.type === "child-list") return [{ key: "Process", label: "Process Master", type: "lookup", required: true, readOnly: false, lookupModuleKey: "process-master", multiple: true }];
    return [{ key: field.key, label: field.label, type: field.type, required: field.required ?? false, readOnly: field.readOnly ?? false, lookupModuleKey: field.lookupModuleKey ?? "", multiple: field.multiple ?? false }];
  }) })), existing, lookupOptions };
  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <Badge>Master Level</Badge>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Organization Master Setup</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Create organization masters in three stages. Starter values are editable and are only created when you submit their master section.
          </p>
        </div>
        {error ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{error}</p> : null}
        {saved === "1" ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">Master records saved successfully.</p> : null}
        {starterError ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{starterError}</p> : null}
        {starterCreated !== undefined && /^\d+$/.test(starterCreated) ? (
          <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {Number(starterCreated) === 0
              ? "All requested masters already exist."
              : `Added ${starterCreated} starter records and size relationships. Existing matching values were reused.`}
          </p>
        ) : null}
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
            <Button type="submit" className="shrink-0">Create Requested Masters</Button>
          </form>
        </div>
        <OrganizationMasterSetupForm action={submitOrganizationMasterSetup} workspaceId={workspaceId} organizationId={organizationId} stage={stage} activeStage={activeStage} />
      </Section>
    </Page>
  );
}