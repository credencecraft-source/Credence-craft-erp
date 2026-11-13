import PosBarcodeBillingPage from "./pos-barcode-billing-page";
import { requireSessionUser } from "@/lib/auth/session-manager";

export default async function QuickInvoicePage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const [{ workspaceId, organizationId }, user] = await Promise.all([
    params,
    requireSessionUser(),
  ]);
  return (
    <PosBarcodeBillingPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      salespersonName={user.full_name}
    />
  );
}