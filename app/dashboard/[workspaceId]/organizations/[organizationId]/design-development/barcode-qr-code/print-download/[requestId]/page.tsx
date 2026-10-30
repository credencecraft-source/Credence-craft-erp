import BarcodeQrPrintRequestDetailPage from "../_page-content/barcode-qr-print-request-detail-page";
import { notFound, redirect } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import { getOrderQrPrintRequest } from "@/lib/services/orders/order-qr-print-request-service";

export default async function Page({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
    requestId: string;
  }>;
}) {
  const { workspaceId, organizationId, requestId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }

  const organization = await requireOrganizationContext(user.id, organizationId);
  await requireOrganizationPermission(user.id, organization.organizationId, "VIEW_REPORTS");
  const request = await getOrderQrPrintRequest(organization.id, requestId);
  if (!request) notFound();

  return (
    <BarcodeQrPrintRequestDetailPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      request={request}
    />
  );
}
