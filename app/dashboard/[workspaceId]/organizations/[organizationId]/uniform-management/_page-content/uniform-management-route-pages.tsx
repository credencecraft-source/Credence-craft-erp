import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Table from "@/components/ui/Table";
import Page from "@/components/ui/Page";
import {
  getOrganizationForUserWithPermission,
  type OrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  getUniformManagementDashboard,
  getUniformEmployeeMeasurementSetup,
  listUniformEmployeeMeasurements,
  getUniformEmployeeMeasurement,
  getUniformMeasurementGroup,
  listUniformMeasurementGroups,
  getUniformStyleForMeasurements,
  getUniformParticipant,
  listUniformParticipants,
  listUniformStyles,
} from "@/lib/services/uniform-management/uniform-management-service";
import { UniformManagementError } from "@/lib/services/uniform-management/uniform-management-contract";
import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  UniformParticipantForm,
  UniformEmployeeMeasurementForm,
} from "./uniform-management-forms";
import {
  UniformPeopleReport,
  UniformStylesReport,
  UniformEmployeeMeasurementsReport,
  UniformMeasurementGroupsReport,
} from "./uniform-management-reports";

type RouteParams = Promise<{ workspaceId: string; organizationId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const EMPTY_SEARCH_PARAMS: Record<string, string | string[] | undefined> = {};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadRecord<T>(record: Promise<T>): Promise<T> {
  try {
    return await record;
  } catch (error) {
    if (error instanceof UniformManagementError) notFound();
    throw error;
  }
}

async function authorizeRoute(
  workspaceId: string,
  organizationId: string,
  permission: OrganizationPermission,
) {
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();
  const organization = await getOrganizationForUserWithPermission(user.id, organizationId, permission);
  if (!organization) notFound();
  return user;
}

function PageTitle({
  title,
  description,
  backHref,
  backLabel = "Back to Uniform Management",
}: {
  title: string;
  description?: string;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <header className="space-y-2">
      <Link href={backHref} className="text-sm font-medium text-[var(--erp-brand)] hover:underline">
        {backLabel}
      </Link>
      <h1 className="text-2xl font-semibold text-[var(--erp-text)]">{title}</h1>
      {description ? <p className="text-sm text-[var(--erp-muted)]">{description}</p> : null}
    </header>
  );
}

function SaveNotice({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-[var(--erp-success-border)] bg-[var(--erp-success-bg)] p-4 text-sm text-[var(--erp-success-text)]" role="status">
      {message}
    </p>
  );
}

export async function UniformStylesRoute({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams?: SearchParams;
}) {
  const [{ workspaceId, organizationId }, query] = await Promise.all([params, searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS)]);
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const styles = await listUniformStyles(user.id, organizationId);
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle
          title="Uniform Styles"
          description="Uniform styles come from your existing Article master. Create or edit them in the standard Article workflow; colors and sizes are reused here."
          backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/dashboard`}
        />
        {firstParam(query.created) ? <SaveNotice message="Article created as a uniform style and added to this report." /> : null}
        {firstParam(query.saved) ? <SaveNotice message="Article updated. Its uniform style details are current." /> : null}
        <UniformStylesReport organizationId={organizationId} workspaceId={workspaceId} records={styles} />
      </div>
    </Page>
  );
}

export async function UniformStyleDetailRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; styleId: string }>;
}) {
  const { workspaceId, organizationId, styleId } = await params;
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const style = await loadRecord(getUniformStyleForMeasurements(user.id, organizationId, styleId));
  const editHref = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article/${encodeURIComponent(style.value_id)}?mode=edit&source=uniform-management`;
  return (
    <Page as="div">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageTitle title={style.article} description={`Style ${style.article_code || "—"} · ${style.variants.length} color${style.variants.length === 1 ? "" : "s"} · ${style.sizes.length} size${style.sizes.length === 1 ? "" : "s"}`} backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/styles`} backLabel="Back to Uniform Styles" />
          <Link href={editHref} className="text-sm font-semibold text-[var(--erp-brand)] hover:underline">Edit style</Link>
        </div>
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Available colors</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {style.variants.length ? style.variants.map((variant) => variant.color.colors).join(", ") : "No active color variants"}
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Available sizes</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {style.sizes.length ? style.sizes.map((size) => size.size).join(", ") : "No active sizes"}
            </p>
          </div>
        </Card>
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Measurement configuration</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              Measurement areas, allowed ranges, and size mappings are managed on the shared Measurement Chart master and selected when a person is measured.
            </p>
          </div>
          <Link className="text-sm font-semibold text-[var(--erp-brand)] hover:underline" href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/measurement-chart`}>
            Open Measurement Chart master
          </Link>
        </Card>
      </div>
    </Page>
  );
}

export async function UniformPeopleRoute({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams?: SearchParams;
}) {
  const [{ workspaceId, organizationId }, query] = await Promise.all([params, searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS)]);
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const participants = await listUniformParticipants(user.id, organizationId);
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle title="People" description="A single roster for students, employees and other uniform recipients. Group or department is optional." backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/dashboard`} />
        {firstParam(query.saved) ? <SaveNotice message="Person added. The People report is current." /> : null}
        <UniformPeopleReport organizationId={organizationId} workspaceId={workspaceId} records={participants} />
      </div>
    </Page>
  );
}

export async function UniformParticipantCreateRoute({ params }: { params: RouteParams }) {
  const { workspaceId, organizationId } = await params;
  await authorizeRoute(workspaceId, organizationId, "MANAGE_MASTER_DATA");
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle title="Add person" description="Create a person record for uniform assignment and measurement capture." backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/people`} backLabel="Cancel and return to People" />
        <UniformParticipantForm workspaceId={workspaceId} organizationId={organizationId} />
      </div>
    </Page>
  );
}

export async function UniformParticipantDetailRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; participantId: string }>;
}) {
  const { workspaceId, organizationId, participantId } = await params;
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const participant = await loadRecord(getUniformParticipant(user.id, organizationId, participantId));
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle title={participant.full_name} description={`${participant.participant_code}${participant.group_label ? ` · ${participant.group_label}` : ""}`} backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/people`} backLabel="Back to People" />
      </div>
    </Page>
  );
}

export async function TakeUniformMeasurementsRoute({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams?: SearchParams;
}) {
  const [{ workspaceId, organizationId }, query] = await Promise.all([params, searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS)]);
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const [records, groups] = await Promise.all([
    listUniformEmployeeMeasurements(user.id, organizationId),
    listUniformMeasurementGroups(user.id, organizationId),
  ]);
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle
          title="Employee Measurements"
          description="Record a person's category, subcategory, Article style, chart, size, fit, and measurement details."
          backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/dashboard`}
        />
        {firstParam(query.saved) ? <SaveNotice message="Employee measurements saved successfully." /> : null}
        <UniformEmployeeMeasurementsReport organizationId={organizationId} workspaceId={workspaceId} records={records} groups={groups} />
      </div>
    </Page>
  );
}

export async function UniformMeasurementGroupsRoute({ params }: { params: RouteParams }) {
  const { workspaceId, organizationId } = await params;
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const groups = await listUniformMeasurementGroups(user.id, organizationId);
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle
          title="Grouped Measurements"
          description="Open a folder to review its measurement records and every captured measurement area."
          backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/dashboard`}
        />
        <UniformMeasurementGroupsReport organizationId={organizationId} workspaceId={workspaceId} records={groups} />
      </div>
    </Page>
  );
}

export async function UniformMeasurementGroupDetailRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; groupId: string }>;
}) {
  const { workspaceId, organizationId, groupId } = await params;
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const group = await loadRecord(getUniformMeasurementGroup(user.id, organizationId, groupId));
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle
          title={group.group_name}
          description={`${group.measurements.length} employee measurement record${group.measurements.length === 1 ? "" : "s"} · Created ${group.created_at.toLocaleDateString()}`}
          backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/grouped-measurements`}
          backLabel="Back to Grouped Measurements"
        />
        {group.measurements.length === 0 ? (
          <Card className="p-6 text-center text-sm text-[var(--erp-muted)]">This group has no measurement records.</Card>
        ) : group.measurements.map((record) => {
          const header = [
            ["Measurement ID", record.measurement_no],
            ["Employee", `${record.participant.full_name} (${record.participant.participant_code})`],
            ["Status", record.status],
            ["Fit status", record.fit_status],
            ["Product category", record.category.category_name],
            ["Subcategory", record.sub_category.sub_category],
            ["Style", record.style.article],
            ["Measurement chart", record.measurement_chart.measurement_chart],
            ["Size", record.size?.size ?? "Per-area size mapping"],
            ["Created", record.created_at.toLocaleString()],
          ];
          return (
            <Card key={record.id} className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-[var(--erp-text)]">{record.measurement_no}</h2>
                <Link
                  className="text-sm font-medium text-[var(--erp-brand)] hover:underline"
                  href={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements/${record.id}`}
                >
                  Open measurement
                </Link>
              </div>
              <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {header.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-muted)]">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="min-w-0 space-y-2">
                <h3 className="text-sm font-semibold text-[var(--erp-text)]">Measurement area details</h3>
                <Table>
                  <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase tracking-wide text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-4 py-3">Measurement area</th>
                      <th className="px-4 py-3">Input</th>
                      <th className="px-4 py-3">Min</th>
                      <th className="px-4 py-3">Max</th>
                      <th className="px-4 py-3">Size prediction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--erp-border)]">
                    {record.details.map((detail, index) => {
                      const areaName = detail.measurement_area_name ?? detail.measurement_area?.measurement_area_name ?? "—";
                      return (
                        <tr key={`${areaName}-${index}`}>
                          <td className="px-4 py-3">{areaName}</td>
                          <td className="px-4 py-3">{detail.input_value.toString()}</td>
                          <td className="px-4 py-3">{detail.minimum_value?.toString() ?? "—"}</td>
                          <td className="px-4 py-3">{detail.maximum_value?.toString() ?? "—"}</td>
                          <td className="px-4 py-3">{detail.predicted_size?.size ?? "—"}</td>
                        </tr>
                      );
                    })}
                    {record.details.length === 0 ? (
                      <tr><td className="px-4 py-3 text-[var(--erp-muted)]" colSpan={5}>No measurement rows.</td></tr>
                    ) : null}
                  </tbody>
                </Table>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

export async function NewUniformEmployeeMeasurementRoute({ params }: { params: RouteParams }) {
  const { workspaceId, organizationId } = await params;
  const user = await authorizeRoute(workspaceId, organizationId, "CREATE_ORDERS");
  const setup = await getUniformEmployeeMeasurementSetup(user.id, organizationId);
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle
          title="New Employee Measurement"
          description="Complete the measurement header and add one or more measurement-area rows."
          backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements`}
          backLabel="Back to Employee Measurements"
        />
        <UniformEmployeeMeasurementForm workspaceId={workspaceId} organizationId={organizationId} setup={setup} />
      </div>
    </Page>
  );
}

export async function UniformEmployeeMeasurementDetailRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; measurementId: string }>;
}) {
  const { workspaceId, organizationId, measurementId } = await params;
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const record = await loadRecord(getUniformEmployeeMeasurement(user.id, organizationId, measurementId));
  const header = [
    ["Employee Name", `${record.participant.full_name} (${record.participant.participant_code})`],
    ["Status", record.status],
    ["Measurement Chart", record.measurement_chart.measurement_chart],
    ["Size", record.size?.size ?? "Per-area size mapping"],
    ["Fit Status", record.fit_status],
    ["Product Category", record.category.category_name],
    ["Subcategory", record.sub_category.sub_category],
    ["Style", record.style.article],
    ["Created", record.created_at.toLocaleString()],
  ];
  return (
    <Page as="div">
      <div className="space-y-6">
        <PageTitle title={`Employee Measurement ${record.measurement_no}`} description="Read-only measurement record." backHref={`/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management/take-measurements`} backLabel="Back to Employee Measurements" />
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-[var(--erp-text)]">Measurement header</h2>
          <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {header.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-muted)]">{label}</dt><dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{value}</dd></div>)}
          </dl>
        </Card>
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-[var(--erp-text)]">Measurement details</h2>
          <Table>
            <thead className="bg-[var(--erp-surface-soft)] text-xs uppercase tracking-wide text-[var(--erp-muted)]"><tr><th className="px-4 py-3">Measurement Area</th><th className="px-4 py-3">Input</th><th className="px-4 py-3">Min</th><th className="px-4 py-3">Max</th><th className="px-4 py-3">Size Prediction</th></tr></thead>
            <tbody className="divide-y divide-[var(--erp-border)]">
              {record.details.map((detail, index) => {
                const areaName = detail.measurement_area_name ?? detail.measurement_area?.measurement_area_name ?? "?";
                return <tr key={`${areaName}-${index}`}><td className="px-4 py-3">{areaName}</td><td className="px-4 py-3">{detail.input_value.toString()}</td><td className="px-4 py-3">{detail.minimum_value?.toString() ?? "?"}</td><td className="px-4 py-3">{detail.maximum_value?.toString() ?? "?"}</td><td className="px-4 py-3">{detail.predicted_size?.size ?? "?"}</td></tr>;
              })}
              {record.details.length === 0 ? <tr><td className="px-4 py-3 text-[var(--erp-muted)]" colSpan={5}>No measurement rows.</td></tr> : null}
            </tbody>
          </Table>
        </Card>
      </div>
    </Page>
  );
}

export async function UniformDashboardRoute({ params }: { params: RouteParams }) {
  const { workspaceId, organizationId } = await params;
  const user = await authorizeRoute(workspaceId, organizationId, "VIEW_ORDERS");
  const stats = await getUniformManagementDashboard(user.id, organizationId);
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/uniform-management`;
  return (
    <Page as="div">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-[var(--erp-text)]">Uniform Management</h1>
          <p className="text-sm text-[var(--erp-muted)]">Manage uniform styles, people, and their recorded measurements.</p>
        </header>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["People", stats.participants, `${base}/people`],
            ["Uniform Styles", stats.styles, `${base}/styles`],
          ].map(([label, count, href]) => (
            <Link key={String(label)} href={String(href)} className="block">
              <Card className="h-full p-6 transition-colors hover:border-[var(--erp-brand)]">
                <p className="text-sm text-[var(--erp-muted)]">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--erp-text)]">{count}</p>
              </Card>
            </Link>
          ))}
        </div>
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-[var(--erp-text)]">Uniform workflow</h2>
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
            <div><h3 className="font-medium text-[var(--erp-text)]">1. Uniform Styles</h3><p className="mt-1 text-sm text-[var(--erp-muted)]">Use the shared Article master for garment styles, colors and sizes; configure measurement ranges and size mapping on Measurement Chart.</p></div>
            <div><h3 className="font-medium text-[var(--erp-text)]">2. People</h3><p className="mt-1 text-sm text-[var(--erp-muted)]">Maintain the roster of employees or students who need uniforms.</p></div>
            <div><h3 className="font-medium text-[var(--erp-text)]">3. Take Measurements</h3><p className="mt-1 text-sm text-[var(--erp-muted)]">Select a person, category, subcategory, style, and measurement template, then record the template details.</p></div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="text-sm font-semibold text-[var(--erp-brand)] hover:underline" href={`${base}/styles`}>Open Uniform Styles</Link>
            <Link className="text-sm font-semibold text-[var(--erp-brand)] hover:underline" href={`${base}/people`}>Open people</Link>
            <Link className="text-sm font-semibold text-[var(--erp-brand)] hover:underline" href={`${base}/take-measurements`}>Take measurements</Link>
          </div>
        </Card>
      </div>
    </Page>
  );
}
