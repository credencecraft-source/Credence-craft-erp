import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import {
  advanceOrganizationDummyData,
  createOrganizationDummyData,
  deleteOrganizationDummyData,
  getDummyDataWorkflowSummary,
  getOrganizationDummyDataStatus,
} from "@/lib/services/organizations/organization-dummy-data-service";
import OrganizationDummyDataActions from "./organization-dummy-data-actions";

export default async function OrganizationDummyDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams?: Promise<{ error?: string; notice?: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const query = (await searchParams) ?? {};
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) notFound();

  const settingsPath = `/dashboard/${workspaceId}/organizations/${organizationId}/settings`;
  const pagePath = `${settingsPath}/dummy-data`;
  const dataset = await getOrganizationDummyDataStatus(user.id, organizationId);
  const workflowSummary = getDummyDataWorkflowSummary(
    dataset.status,
    dataset.stage,
    "completedSteps" in dataset ? dataset.completedSteps?.includes(9) ?? false : false,
  );

  async function createDummyDataAction() {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) notFound();
    let result;
    try {
      result = await createOrganizationDummyData(actionUser.id, organizationId, actionUser.full_name);
    } catch (error) {
      redirect(`${pagePath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create dummy data.")}`);
    }
    revalidatePath(pagePath);
    const nextSummary = getDummyDataWorkflowSummary("status" in result ? result.status : dataset.status, "stage" in result ? result.stage : dataset.stage);
    redirect(`${pagePath}?notice=${encodeURIComponent(result.created
      ? `Sample data setup started and is currently ${nextSummary.title.toLowerCase()}.`
      : "Dummy data already exists for this organization.")}`);
  }

  async function advanceDummyDataAction() {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) notFound();
    let result;
    try {
      result = await advanceOrganizationDummyData(actionUser.id, organizationId, actionUser.full_name);
    } catch (error) {
      redirect(`${pagePath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to continue dummy-data setup.")}`);
    }
    revalidatePath(pagePath);
    const nextSummary = getDummyDataWorkflowSummary(
      result.status,
      result.stage,
      "completedCount" in result && result.completedCount >= 5,
    );
    redirect(`${pagePath}?notice=${encodeURIComponent("advanced" in result && result.advanced
      ? `Sample setup advanced to ${nextSummary.title.toLowerCase()}.`
      : `Sample data is still waiting on the ${nextSummary.title.toLowerCase()} step.`)}`);
  }

  async function deleteDummyDataAction() {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) notFound();
    let result;
    try {
      result = await deleteOrganizationDummyData(actionUser.id, organizationId);
    } catch (error) {
      redirect(`${pagePath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete dummy data.")}`);
    }
    revalidatePath(pagePath);
    redirect(`${pagePath}?notice=${encodeURIComponent(result.deleted ? "Dummy data was deleted. Organization setup and baseline master values were preserved." : "There is no dummy dataset to delete.")}`);
  }

  async function recreateDummyDataTestAction() {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) notFound();
    let result;
    try {
      const deleted = await deleteOrganizationDummyData(actionUser.id, organizationId);
      if (!deleted.deleted) throw new Error("There is no active demo dataset to recreate.");
      result = await createOrganizationDummyData(actionUser.id, organizationId, actionUser.full_name);
    } catch (error) {
      redirect(`${pagePath}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to recreate dummy data.")}`);
    }
    revalidatePath(pagePath);
    revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement`);
    revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/create-po/style-wise`);
    revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/purchase-order`);
    revalidatePath(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/create`);
    redirect(`${pagePath}?notice=${encodeURIComponent(`Demo dataset recreated with ${result.orderCount} sample orders and five pending sample Purchase Orders.`)}`);
  }

  return (
    <Page>
      <Section className="space-y-6">
        <div>
          <Link
            href={settingsPath}
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Organization Settings
          </Link>
          <p className="erp-eyebrow mt-4">Organization Setup</p>
          <h1 className="erp-page-heading">Dummy Data</h1>
          <p className="erp-page-subheading">
            Create a separate sample dataset for {organization.organization_name}, including master data, sample orders, procurement approvals, and at least five work orders.
          </p>
        </div>

        <Card className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">Sample dataset</h2>
            </div>
            <Badge>{dataset.status === "ACTIVE" ? "Active" : dataset.status === "EMPTY" ? "Not created" : dataset.status === "SCHEMA_NOT_READY" ? "Database update required" : dataset.status}</Badge>
          </div>
          <p className="text-sm text-slate-600">
            This creates sample merchandising masters and a draft order. Organization-created entity, state, GST, raw-material type, and finished-goods type values are reused and are never included in the removable demo batch.
          </p>
          {dataset.status === "SCHEMA_NOT_READY" ? (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
              The database update for dummy-data tracking has not been applied yet. These actions will be available after the organization database migration is deployed.
            </p>
          ) : null}
          {dataset.orderNo ? <p className="text-sm text-slate-700">Sample order: <strong>{dataset.orderNo}</strong> · {dataset.masterCount} demo master records</p> : null}
          {"sampleWorkOrderCount" in dataset ? (
            <p className="text-sm text-slate-700">Sample work orders: {dataset.sampleWorkOrderCount} / 5 required</p>
          ) : null}
          {(dataset.status !== "EMPTY" && dataset.status !== "SCHEMA_NOT_READY") ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Workflow status</p>
              <h3 className="mt-2 text-base font-semibold text-slate-900">{workflowSummary.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{workflowSummary.detail}</p>
              {!("completedSteps" in dataset && dataset.completedSteps?.includes(9)) ? (
                <form action={advanceDummyDataAction} className="mt-3">
                  <Button type="submit" variant="secondary" size="sm">
                    {dataset.stage === "CREATE_WORK_ORDERS" || (dataset.status === "ACTIVE" && dataset.stage === "COMPLETE")
                      ? "Create work orders"
                      : "Continue setup"}
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
          {query.error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{query.error}</p> : null}
          {query.notice ? <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">{query.notice}</p> : null}
          <OrganizationDummyDataActions
            active={dataset.status === "ACTIVE"}
            available={dataset.status !== "SCHEMA_NOT_READY"}
            createAction={createDummyDataAction}
            deleteAction={deleteDummyDataAction}
            recreateAction={recreateDummyDataTestAction}
          />
        </Card>
      </Section>
    </Page>
  );
}