import { redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  getActivePosCounterShift,
  getPosCounterShiftReadinessMessage,
} from "@/lib/services/pos/pos-counter-shift-service";

import PosBarcodeBillingPage from "./pos-barcode-billing-page";

export default async function QuickInvoicePage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const [{ workspaceId, organizationId }, user] = await Promise.all([
    params,
    requireSessionUser(),
  ]);
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  const organization = await requireOrganizationContext(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.id, "CREATE_POS_SALES");
  let activeShift: Awaited<ReturnType<typeof getActivePosCounterShift>> = null;
  let shiftSetupError: string | undefined;
  try {
    activeShift = await getActivePosCounterShift({
      organizationId: organization.id,
      salespersonId: user.id,
    });
  } catch (error) {
    const readinessMessage = getPosCounterShiftReadinessMessage(error);
    if (!readinessMessage) throw error;
    shiftSetupError = readinessMessage;
  }
  return (
    <PosBarcodeBillingPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      salespersonName={user.full_name}
      activeShift={activeShift}
      shiftSetupError={shiftSetupError}
    />
  );
}