import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { getOrganizationKycProfileForUser } from "@/lib/services/organizations/organization-kyc-service";
import OrganizationKycForm from "./organization-kyc-form";
import {
  resetOrganizationKycDraftAction,
  saveOrganizationKycDraftAction,
  submitOrganizationKycAction,
} from "../organization-kyc-actions";

export default async function OrganizationKycPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) notFound();

  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) notFound();

  const profile = await getOrganizationKycProfileForUser(user.id, organization.id);
  const saveDraftAction = saveOrganizationKycDraftAction.bind(null, workspaceId, organizationId);
  const submitAction = submitOrganizationKycAction.bind(null, workspaceId, organizationId);
  const resetDraftAction = resetOrganizationKycDraftAction.bind(null, workspaceId, organizationId);

  return (
    <Page>
      <Section className="space-y-6">
        <Link href={`/dashboard/${workspaceId}/home`} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--erp-brand)] transition-colors hover:text-[var(--erp-brand-hover)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Workspace Home
        </Link>
        <div>
          <p className="erp-eyebrow">Organization Settings</p>
          <h1 className="erp-page-heading">KYC &amp; Verification</h1>
          <p className="erp-page-subheading">Submit organization details for platform review and verification.</p>
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="erp-section-heading">KYC status</h2>
            <p className="mt-1 text-sm text-slate-600">
              Verify the registration details and complete the profile for platform review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <OrganizationKycForm
              initialProfile={profile}
              progressStorageKey={`organization-kyc-progress:${workspaceId}:${organizationId}`}
              saveDraftAction={saveDraftAction}
              submitAction={submitAction}
              resetDraftAction={resetDraftAction}
              registrationSnapshot={{
                gst_number: organization.gst_number,
                name: organization.organization_name,
                address: [
                  organization.address_line_1,
                  organization.address_line_2,
                  organization.city,
                  organization.state,
                  organization.pin_code,
                  organization.country,
                ].filter(Boolean).join(", "),
                createdAt: organization.created_at.toISOString().slice(0, 10),
              }}
            />
          </div>
        </Card>
      </Section>
    </Page>
  );
}
