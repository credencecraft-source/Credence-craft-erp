import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

type Props = {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
};

export default async function MerchandisingHomePage({
  params,
}: Props) {
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
    organizationId
  );

  if (!organization) {
    notFound();
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Card className="p-6 text-sm text-slate-600">
          Choose a merchandising module from the tabs above to switch
          between Orders, Order Summary, Samples, and BOM.
        </Card>
      </Section>
    </Page>
  );
}
