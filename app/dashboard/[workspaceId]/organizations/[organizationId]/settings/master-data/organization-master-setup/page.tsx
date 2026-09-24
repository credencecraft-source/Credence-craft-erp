import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { createOrganizationMasterSetupStage, type OrganizationMasterSetupRecord } from "@/lib/services/master-data/organization-master-setup-service";
import OrganizationMasterSetupForm from "./organization-master-setup-form";

async function submitOrganizationMasterSetup(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  let input: { stage: "independent" | "related" | "third"; records: OrganizationMasterSetupRecord[] };
  try { input = JSON.parse(String(formData.get("setup") ?? "")) as typeof input; } catch { redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup?error=Invalid%20setup%20data`); }
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
  try { await createOrganizationMasterSetupStage(organization.id, input.records); } catch (error) { redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup?step=${input.stage}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create master records.")}`); }
  revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data`);
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/organization-master-setup?step=${input.stage}&saved=1`);
}

export default async function OrganizationMasterSetupPage({ params, searchParams }: { params: Promise<{ workspaceId: string; organizationId: string }>; searchParams: Promise<{ error?: string; saved?: string; step?: string }> }) {
  const { workspaceId, organizationId } = await params;
  const { error, saved, step } = await searchParams;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
  const onboardingExcludedMasterKeys = new Set(["article", "category-type", "gold-seal", "gold-seal-variant", "gst", "gst-type", "hsn", "measurement-chart", "operation", "operation-template", "raw-material", "season", "size-wise-consumption", "state"]);
  const definitions = MASTER_DEFINITIONS.filter((definition) => !definition.hidden && definition.fields.length > 0 && !onboardingExcludedMasterKeys.has(definition.key));
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
  return <Page as="div"><Section className="space-y-6"><div><Badge>Master Level</Badge><h1 className="mt-3 text-3xl font-bold text-slate-900">Organization Master Setup</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">Create organization masters in three stages. Existing records are loaded directly from this organization; no starter values are inserted.</p></div>{error ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{error}</p> : null}{saved === "1" ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">Master records saved successfully.</p> : null}<OrganizationMasterSetupForm action={submitOrganizationMasterSetup} workspaceId={workspaceId} organizationId={organizationId} stage={stage} activeStage={activeStage} /></Section></Page>;
}