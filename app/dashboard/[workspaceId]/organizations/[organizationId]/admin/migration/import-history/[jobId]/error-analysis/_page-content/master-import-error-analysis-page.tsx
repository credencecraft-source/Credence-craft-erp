import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import MasterImportErrorGroupAction from "./master-import-error-group-action";
import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getMasterImportErrorAnalysis,
} from "@/lib/services/master-data/master-import-service";
import {
  getOrganizationForUser,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import { humanizeImportFieldName } from "@/lib/master-data/master-import-report-format";

type ErrorAnalysisPageProps = {
  params: Promise<{ workspaceId: string; organizationId: string; jobId: string }>;
};

export default async function MasterImportErrorAnalysisPage({ params }: ErrorAnalysisPageProps) {
  const { workspaceId, organizationId, jobId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id) redirect("/");
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const analysis = await getMasterImportErrorAnalysis(organization.id, jobId);
  const reportHref = `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/admin/migration/import-history/${encodeURIComponent(jobId)}`;

  return (
    <Page>
      <Section>
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Link
              href={reportHref}
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--erp-brand)] hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Import report
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-[var(--erp-text)]">Import error analysis</h1>
              <p className="mt-1 break-words text-sm text-[var(--erp-muted)]">
                {analysis.fileName} · Same validation reason and fields are grouped together.
              </p>
            </div>
          </div>
          <Badge>{analysis.totalErrorRows.toLocaleString()} error rows</Badge>
        </header>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Card className="space-y-1">
            <p className="text-sm text-[var(--erp-muted)]">Rows needing attention</p>
            <p className="text-2xl font-semibold text-[var(--erp-text)]">
              {analysis.totalErrorRows.toLocaleString()}
            </p>
          </Card>
          <Card className="space-y-1">
            <p className="text-sm text-[var(--erp-muted)]">Distinct reasons</p>
            <p className="text-2xl font-semibold text-[var(--erp-text)]">
              {analysis.reasonCount.toLocaleString()}
            </p>
          </Card>
        </div>

        {analysis.groupedErrors.length === 0 ? (
          <Card>
            <h2 className="text-base font-semibold text-[var(--erp-text)]">No validation errors</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              This import currently has no rows with saved validation reasons.
            </p>
          </Card>
        ) : (
          <Card className="min-w-0 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--erp-text)]">Grouped reasons</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                Counts show how many distinct rows have each reason. A row is counted once per matching reason.
              </p>
            </div>
            <div className="max-w-full overflow-x-auto rounded-lg border border-[var(--erp-border)]">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-[var(--erp-surface-soft)] text-[var(--erp-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Count</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Error / reason</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Affected fields</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Sample workbook rows</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {analysis.groupedErrors.map((group, index) => (
                    <tr key={`${group.reason}-${index}`} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge>{group.affectedRows.toLocaleString()} rows</Badge>
                      </td>
                      <td className="max-w-xl whitespace-normal px-4 py-3 text-[var(--erp-text)]">
                        {group.reason}
                      </td>
                      <td className="px-4 py-3 text-[var(--erp-muted)]">
                        {group.fields.length
                          ? group.fields.map(humanizeImportFieldName).join(", ")
                          : "General"}
                      </td>
                      <td className="px-4 py-3 text-[var(--erp-muted)]">
                        {group.sampleRows.map((rowNumber) => `#${rowNumber}`).join(", ")}
                        {group.affectedRows > group.sampleRows.length ? ", …" : ""}
                      </td>
                      <td className="px-4 py-3">
                        {analysis.moduleKey === "article" ? (
                          <MasterImportErrorGroupAction
                            organizationId={organizationId}
                            jobId={jobId}
                            reason={group.reason}
                            affectedRows={group.affectedRows}
                          />
                        ) : (
                          <span className="text-sm text-[var(--erp-muted)]">
                            Correct from the Errors tab
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Section>
    </Page>
  );
}
