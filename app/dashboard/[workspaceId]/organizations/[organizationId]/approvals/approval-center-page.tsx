import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export default async function ApprovalCenterPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(
    user.id,
    organizationId,
  );

  if (!organization) {
    notFound();
  }

  const approvalModules: Array<{
    title: string;
    description: string;
    href: string;
  }> = [];

  return (
    <Page as="div">
      <Section className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="border-b border-slate-200 pb-4">
          <Badge>Approval</Badge>

          <h1 className="mt-3 text-xl font-bold text-slate-900">
            Approval Center
          </h1>

          <p className="mt-1 max-w-3xl text-xs text-slate-500">
            This is the central approval workspace for the ERP. The current
            scope focuses on the master approval workflow. Additional approval
            modules can be connected here as the ERP grows.
          </p>
        </div>

        {approvalModules.length === 0 ? (
          <Card className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="py-6 text-center space-y-1">
              <h2 className="text-sm font-bold text-slate-900">
                No Approval Modules Available
              </h2>

              <p className="text-xs text-slate-500">
                Approval modules will appear here once they are configured.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {approvalModules.map((module) => (
              <Link
                key={module.title}
                href={module.href}
                className="group block"
              >
                <Card className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:border-emerald-300 hover:shadow-md">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Module
                  </p>

                  <h2 className="mt-1 text-sm font-bold text-slate-900">
                    {module.title}
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    {module.description}
                  </p>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-700">
                      Open Queue
                    </span>

                    <span
                      aria-hidden="true"
                      className="text-xs transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}
